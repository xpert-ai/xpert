import type {
    ActiveCapabilityPointer,
    ApprovalDecision,
    CapabilityVersion,
    CapabilityVersionBundle,
    DatasetSnapshot,
    EvaluationMetrics,
    EvaluationRun,
    EvolutionAuditEvent,
    EvolutionCandidate,
    EvolutionSimulationResult,
    EvolutionScope,
    ImprovementProposal,
    LearningEvent,
    ReleaseDeployment,
    ReleasePackage,
    ReleaseRuntimeObservation,
    ReplayCaseResult,
    XpertResolvedViewHostContext
} from '@xpert-ai/contracts'
import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { BadRequestException, Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { hashEvolutionValue } from '../domain/evolution-hash'
import { CONFORMANCE_FIELD_MAPPING_EXAMPLE } from '../examples'
import { CONFORMANCE_FIELD_MAPPING_TARGET } from '../providers'
import { AgentEvolutionStore, EvolutionTenantScope } from './agent-evolution.store'

export type { EvolutionSimulationResult } from '@xpert-ai/contracts'

@Injectable()
export class AgentEvolutionService {
    constructor(
        private readonly store: AgentEvolutionStore,
        private readonly providers: EvolutionTargetProviderRegistry
    ) {}

    async getDashboard(context: Pick<XpertResolvedViewHostContext, 'tenantId' | 'organizationId'>) {
        return this.store.getDashboard(toTenantScope(context))
    }

    async synchronizeTargets(context: Pick<XpertResolvedViewHostContext, 'tenantId' | 'organizationId'>) {
        const tenant = toTenantScope(context)
        const descriptors = this.providers.listDescriptors(context.organizationId ?? undefined)
        await Promise.all(descriptors.map((descriptor) => this.store.upsertTarget(tenant, descriptor)))
        return descriptors
    }

    async runConformanceSimulation(input: {
        tenantId: string
        organizationId?: string | null
        actorId: string
        actorRole: string
    }): Promise<EvolutionSimulationResult> {
        const tenant = toTenantScope(input)
        const simulationId = randomUUID().slice(0, 8)
        const now = new Date().toISOString()
        const scope: EvolutionScope = {
            type: 'organization',
            key: input.organizationId ?? input.tenantId
        }
        await this.synchronizeTargets(input)
        const provider = this.providers.get(CONFORMANCE_FIELD_MAPPING_TARGET, input.organizationId ?? undefined)
        if (!provider.candidateBuilder || !provider.replayEvaluator || !provider.releaseProvider) {
            throw new BadRequestException('Conformance provider does not implement the complete evolution contract')
        }

        const pointerBefore = await this.store.findPointer(tenant, CONFORMANCE_FIELD_MAPPING_TARGET, scope)
        const baselineVersion = pointerBefore
            ? await this.requireVersion(tenant, pointerBefore.activeVersionId)
            : await this.createBaselineVersion(tenant, simulationId, input.actorId, now)
        const pointer =
            pointerBefore?.value ?? (await this.createInitialPointer(tenant, scope, baselineVersion, input, now))
        const baselineBundle = await this.createBundle(
            tenant,
            `bundle-${simulationId}-baseline`,
            'production',
            [baselineVersion],
            now
        )

        const learningEvents = await this.createLearningEvents(tenant, simulationId, scope, baselineBundle, input, now)
        const proposal = await this.createProposal(
            tenant,
            simulationId,
            scope,
            baselineVersion.versionId,
            learningEvents,
            input,
            now
        )
        const candidate = await this.buildCandidate(
            tenant,
            simulationId,
            scope,
            proposal,
            baselineVersion,
            provider.candidateBuilder,
            input,
            now
        )
        const snapshot = await this.createDatasetSnapshot(tenant, simulationId, now)
        const candidateBundle = await this.createCandidateBundle(tenant, simulationId, candidate, now)
        await this.store.transitionCandidate(tenant, candidate.candidateId, 'evaluating')
        const evaluation = await this.runEvaluation(
            tenant,
            simulationId,
            candidate,
            snapshot,
            baselineBundle,
            candidateBundle,
            provider.replayEvaluator,
            now
        )
        await this.store.transitionCandidate(
            tenant,
            candidate.candidateId,
            evaluation.gate.passed ? 'pending_approval' : 'evaluation_failed'
        )
        if (!evaluation.gate.passed) {
            throw new BadRequestException(
                `Conformance evaluation failed: ${evaluation.gate.blockingReasons.join(', ')}`
            )
        }

        const approval = await this.approveCandidate(tenant, candidate, evaluation, input, now)
        await this.store.transitionCandidate(tenant, candidate.candidateId, 'approved')
        const version = await this.createPromotedVersion(
            tenant,
            simulationId,
            candidate,
            baselineVersion,
            input.actorId,
            now
        )
        const release = await this.createRelease(
            tenant,
            simulationId,
            scope,
            candidate,
            evaluation,
            approval,
            version,
            baselineVersion,
            input,
            now
        )
        await this.store.transitionCandidate(tenant, candidate.candidateId, 'packaged')
        await provider.releaseProvider.install({
            targetId: release.targetId,
            versionId: release.targetVersionId,
            artifactHash: release.artifactHash,
            scope,
            releasePackageId: release.releasePackageId,
            actorId: input.actorId,
            idempotencyKey: `${release.releasePackageId}:install`
        })
        await this.store.transitionRelease(tenant, release.releasePackageId, 'installed')
        await this.audit(tenant, release, input, 'release.installed', 'Immutable candidate version installed.', now)

        const shadow = await this.runDeployment(
            tenant,
            simulationId,
            release,
            'shadow',
            CONFORMANCE_FIELD_MAPPING_EXAMPLE.rollout.shadow.canaryPercent,
            CONFORMANCE_FIELD_MAPPING_EXAMPLE.rollout.shadow.sampleCount,
            CONFORMANCE_FIELD_MAPPING_EXAMPLE.rollout.shadow.observationCount,
            evaluation,
            now,
            0
        )
        await this.store.transitionRelease(tenant, release.releasePackageId, 'shadow')
        await this.audit(
            tenant,
            release,
            input,
            'deployment.shadow_passed',
            `${shadow.sampleCount} persisted shadow replay samples, zero severe errors.`,
            shadow.completedAt ?? now
        )

        const canary = await this.runDeployment(
            tenant,
            simulationId,
            release,
            'canary',
            CONFORMANCE_FIELD_MAPPING_EXAMPLE.rollout.canary.canaryPercent,
            CONFORMANCE_FIELD_MAPPING_EXAMPLE.rollout.canary.sampleCount,
            CONFORMANCE_FIELD_MAPPING_EXAMPLE.rollout.canary.observationCount,
            evaluation,
            now,
            6 * 60 * 1000
        )
        await this.store.transitionRelease(tenant, release.releasePackageId, 'canary')
        await this.audit(
            tenant,
            release,
            input,
            'deployment.canary_passed',
            `${canary.canaryPercent}% deterministic canary passed with ${canary.sampleCount} persisted samples.`,
            canary.completedAt ?? now
        )
        await provider.releaseProvider.activate({
            targetId: release.targetId,
            versionId: release.targetVersionId,
            artifactHash: release.artifactHash,
            scope,
            releasePackageId: release.releasePackageId,
            actorId: input.actorId,
            idempotencyKey: `${release.releasePackageId}:activate`
        })
        const activatedPointer = await this.store.activatePointerCas({
            tenant,
            pointerId: pointer.pointerId,
            expectedRevision: pointer.revision,
            expectedVersionId: baselineVersion.versionId,
            newVersionId: version.versionId,
            releasePackageId: release.releasePackageId,
            actorId: input.actorId,
            actorRole: input.actorRole,
            occurredAt: canary.completedAt ?? now
        })

        const auditIds = [
            `AUD-${simulationId}-events`,
            `AUD-${release.releasePackageId}-release.installed`,
            `AUD-${release.releasePackageId}-deployment.shadow_passed`,
            `AUD-${release.releasePackageId}-deployment.canary_passed`,
            `AUD-${release.releasePackageId}-activate`
        ]
        const bundleIds = [baselineBundle.bundleId, candidateBundle.bundleId]
        const versionIds = [baselineVersion.versionId, version.versionId]
        const persistence = await this.store.verifyPersistence(tenant, {
            targetIds: [CONFORMANCE_FIELD_MAPPING_TARGET],
            versionIds,
            bundleIds,
            pointerIds: [activatedPointer.pointerId],
            eventIds: learningEvents.map((event) => event.eventId),
            proposalIds: [proposal.proposalId],
            candidateIds: [candidate.candidateId],
            datasetSnapshotIds: [snapshot.snapshotId],
            evaluationRunIds: [evaluation.runId],
            approvalIds: [approval.approvalId],
            releasePackageIds: [release.releasePackageId],
            deploymentIds: [shadow.deploymentId, canary.deploymentId],
            auditIds
        })

        return {
            example: {
                key: CONFORMANCE_FIELD_MAPPING_EXAMPLE.key,
                name: CONFORMANCE_FIELD_MAPPING_EXAMPLE.name,
                description: CONFORMANCE_FIELD_MAPPING_EXAMPLE.description,
                dataClassification: CONFORMANCE_FIELD_MAPPING_EXAMPLE.dataClassification
            },
            simulationId,
            targetId: CONFORMANCE_FIELD_MAPPING_TARGET,
            eventIds: learningEvents.map((event) => event.eventId),
            proposalId: proposal.proposalId,
            candidateId: candidate.candidateId,
            datasetSnapshotId: snapshot.snapshotId,
            evaluationRunId: evaluation.runId,
            approvalId: approval.approvalId,
            releasePackageId: release.releasePackageId,
            deploymentIds: [shadow.deploymentId, canary.deploymentId],
            bundleIds,
            versionIds,
            pointerId: activatedPointer.pointerId,
            previousVersionId: baselineVersion.versionId,
            activeVersionId: version.versionId,
            pointerRevision: activatedPointer.revision,
            gatePassed: evaluation.gate.passed,
            auditIds,
            auditActions: [
                'release.installed',
                'deployment.shadow_passed',
                'deployment.canary_passed',
                'active_pointer.cas_activated'
            ],
            persistence
        }
    }

    private async requireVersion(tenant: EvolutionTenantScope, versionId: string) {
        const version = await this.store.findVersion(tenant, versionId)
        if (!version) {
            throw new BadRequestException(`Active capability version '${versionId}' cannot be resolved`)
        }
        return version.value
    }

    private async createBaselineVersion(
        tenant: EvolutionTenantScope,
        simulationId: string,
        actorId: string,
        now: string
    ) {
        const artifactValue = {
            canonicalField: CONFORMANCE_FIELD_MAPPING_EXAMPLE.canonicalField,
            aliases: [...CONFORMANCE_FIELD_MAPPING_EXAMPLE.baselineAliases]
        }
        const artifactHash = hashEvolutionValue(artifactValue)
        const version: CapabilityVersion = {
            versionId: `CFM-${simulationId}-v1`,
            targetId: CONFORMANCE_FIELD_MAPPING_TARGET,
            sequence: 1,
            semanticVersion: '1.0.0',
            artifact: {
                uri: `evolution://capability/${simulationId}/v1`,
                hash: artifactHash,
                schemaVersion: '1',
                mediaType: 'application/json'
            },
            providerKey: CONFORMANCE_FIELD_MAPPING_TARGET,
            providerVersion: '1.0.0',
            dependencyVersionIds: [],
            createdAt: now,
            createdBy: actorId
        }
        await this.store.saveVersion(tenant, version)
        return version
    }

    private async createInitialPointer(
        tenant: EvolutionTenantScope,
        scope: EvolutionScope,
        baseline: CapabilityVersion,
        input: { actorId: string },
        now: string
    ) {
        const pointer: ActiveCapabilityPointer = {
            pointerId: randomUUID(),
            targetId: CONFORMANCE_FIELD_MAPPING_TARGET,
            scope,
            channel: 'production',
            activeVersionId: baseline.versionId,
            revision: 1,
            updatedAt: now,
            updatedBy: input.actorId
        }
        await this.store.savePointer(tenant, pointer)
        return pointer
    }

    private async createBundle(
        tenant: EvolutionTenantScope,
        bundleId: string,
        executionMode: CapabilityVersionBundle['executionMode'],
        versions: CapabilityVersion[],
        now: string
    ) {
        const items = versions
            .map((version) => ({
                targetId: version.targetId,
                versionId: version.versionId,
                artifactHash: version.artifact.hash,
                providerKey: version.providerKey,
                providerVersion: version.providerVersion
            }))
            .sort((left, right) => left.targetId.localeCompare(right.targetId))
        const bundle: CapabilityVersionBundle = {
            bundleId,
            bundleHash: hashEvolutionValue(items),
            executionMode,
            items,
            createdAt: now
        }
        await this.store.saveBundle(tenant, bundle)
        return bundle
    }

    private async createLearningEvents(
        tenant: EvolutionTenantScope,
        simulationId: string,
        scope: EvolutionScope,
        bundle: CapabilityVersionBundle,
        input: { actorId: string },
        now: string
    ) {
        const events: LearningEvent[] = CONFORMANCE_FIELD_MAPPING_EXAMPLE.learningSignals.map((signal, index) => ({
            eventId: `LE-${simulationId}-${index + 1}`,
            eventType: 'prediction_reviewed',
            schemaVersion: '1',
            idempotencyKey: `conformance:${simulationId}:${index + 1}`,
            eventTime: now,
            scope,
            executionId: `EXEC-${simulationId}-${index + 1}`,
            traceId: `TRACE-${simulationId}-${index + 1}`,
            targetId: CONFORMANCE_FIELD_MAPPING_TARGET,
            decisionPoint: 'field_alias_resolution',
            subjectRef: `fixture://case/${simulationId}/${index + 1}`,
            inputFingerprint: hashEvolutionValue({ field: signal.sourceField, value: signal.value }),
            predictionSummary: 'Field was not mapped by the active baseline.',
            finalOutcomeSummary: `Reviewer mapped ${signal.sourceField} to ${CONFORMANCE_FIELD_MAPPING_EXAMPLE.canonicalField}.`,
            confidence: signal.confidence,
            reasonCodes: ['low_confidence_alias'],
            capabilityVersionBundleId: bundle.bundleId,
            bundleHash: bundle.bundleHash,
            trustLevel: 'L3',
            classification: 'internal',
            redactionStatus: 'not_required',
            createdAt: now
        }))
        await Promise.all(events.map((event) => this.store.saveLearningEvent(tenant, event)))
        await this.store.saveAudit(tenant, {
            auditId: `AUD-${simulationId}-events`,
            action: 'learning_events.ingested',
            actorId: input.actorId,
            actorRole: 'simulation_operator',
            summary: `${events.length} immutable learning events ingested.`,
            occurredAt: now
        })
        return events
    }

    private async createProposal(
        tenant: EvolutionTenantScope,
        simulationId: string,
        scope: EvolutionScope,
        baseVersionId: string,
        events: LearningEvent[],
        input: { actorId: string },
        now: string
    ) {
        const proposal: ImprovementProposal = {
            proposalId: `IP-${simulationId}`,
            revision: 1,
            targetId: CONFORMANCE_FIELD_MAPPING_TARGET,
            scope,
            title: 'Expand localized amount aliases',
            problemStatement: 'The active mapping misses reviewed localized amount fields.',
            rootCause: 'The baseline alias set only contains normalized English keys.',
            changeHypothesis: 'Adding reviewed aliases will improve mapping accuracy without changing existing keys.',
            evidenceEventIds: events.map((event) => event.eventId),
            baseVersionId,
            riskLevel: 'R1',
            status: 'ready',
            createdAt: now,
            createdBy: input.actorId
        }
        await this.store.saveProposal(tenant, proposal)
        return proposal
    }

    private async buildCandidate(
        tenant: EvolutionTenantScope,
        simulationId: string,
        scope: EvolutionScope,
        proposal: ImprovementProposal,
        baseline: CapabilityVersion,
        builder: NonNullable<ReturnType<typeof this.providers.get>['candidateBuilder']>,
        input: { actorId: string },
        now: string
    ) {
        const build = await builder.buildCandidate({
            targetId: proposal.targetId,
            scope,
            proposalId: proposal.proposalId,
            proposalRevision: proposal.revision,
            baseVersionId: baseline.versionId,
            changeSet: {
                operation: 'add_aliases',
                aliases: CONFORMANCE_FIELD_MAPPING_EXAMPLE.candidateAliases.filter(
                    (alias) => !CONFORMANCE_FIELD_MAPPING_EXAMPLE.baselineAliases.includes(alias)
                )
            },
            evidenceEventIds: proposal.evidenceEventIds,
            dependencyVersionIds: baseline.dependencyVersionIds,
            actorId: input.actorId,
            idempotencyKey: `${proposal.proposalId}:${proposal.revision}`
        })
        const validation = await builder.validateCandidate({
            targetId: proposal.targetId,
            scope,
            artifact: build.artifact,
            baseVersionId: baseline.versionId,
            dependencyVersionIds: build.dependencyVersionIds
        })
        if (!validation.valid) {
            throw new BadRequestException(`Candidate validation failed: ${validation.failureCodes.join(', ')}`)
        }
        const candidate: EvolutionCandidate = {
            candidateId: `CAND-${simulationId}`,
            targetId: proposal.targetId,
            baseVersionId: baseline.versionId,
            proposalId: proposal.proposalId,
            proposalRevision: proposal.revision,
            artifact: build.artifact,
            providerKey: CONFORMANCE_FIELD_MAPPING_TARGET,
            providerVersion: '1.0.0',
            dependencyVersionIds: build.dependencyVersionIds,
            targetScope: scope,
            buildInputsHash: build.buildInputsHash,
            status: 'building',
            createdBy: input.actorId,
            createdAt: now
        }
        await this.store.saveCandidate(tenant, candidate)
        const ready = await this.store.transitionCandidate(tenant, candidate.candidateId, 'ready')
        return ready.value
    }

    private async createDatasetSnapshot(tenant: EvolutionTenantScope, simulationId: string, now: string) {
        const cases = CONFORMANCE_FIELD_MAPPING_EXAMPLE.goldenCases.map((fixture, index) => ({
            caseId: `GR-${simulationId}-${index + 1}`,
            revision: 1,
            input: { sourceField: fixture.sourceField, value: fixture.value },
            expected: { field: CONFORMANCE_FIELD_MAPPING_EXAMPLE.canonicalField, value: fixture.value },
            slice: fixture.slice,
            risk: fixture.risk,
            evidenceRef: `fixture://golden/${simulationId}/${index + 1}`
        }))
        const snapshot: DatasetSnapshot = {
            snapshotId: `DS-${simulationId}`,
            datasetId: 'conformance-field-mapping-v1',
            name: 'Conformance field mapping golden snapshot',
            evaluatorVersion: 'exact-match-v1',
            metricDefinitionVersion: 'mapping-gates-v1',
            cases,
            snapshotHash: hashEvolutionValue(cases),
            createdAt: now
        }
        await this.store.saveDataset(tenant, snapshot)
        return snapshot
    }

    private createCandidateBundle(
        tenant: EvolutionTenantScope,
        simulationId: string,
        candidate: EvolutionCandidate,
        now: string
    ) {
        const bundle: CapabilityVersionBundle = {
            bundleId: `bundle-${simulationId}-candidate`,
            bundleHash: hashEvolutionValue([
                {
                    targetId: candidate.targetId,
                    versionId: candidate.candidateId,
                    artifactHash: candidate.artifact.hash,
                    providerKey: candidate.providerKey,
                    providerVersion: candidate.providerVersion
                }
            ]),
            executionMode: 'replay',
            items: [
                {
                    targetId: candidate.targetId,
                    versionId: candidate.candidateId,
                    artifactHash: candidate.artifact.hash,
                    providerKey: candidate.providerKey,
                    providerVersion: candidate.providerVersion
                }
            ],
            createdAt: now
        }
        return this.store.saveBundle(tenant, bundle).then(() => bundle)
    }

    private async runEvaluation(
        tenant: EvolutionTenantScope,
        simulationId: string,
        candidate: EvolutionCandidate,
        snapshot: DatasetSnapshot,
        baselineBundle: CapabilityVersionBundle,
        candidateBundle: CapabilityVersionBundle,
        evaluator: NonNullable<ReturnType<typeof this.providers.get>['replayEvaluator']>,
        now: string
    ) {
        const runId = `ER-${simulationId}`
        const caseResults: ReplayCaseResult[] = []
        for (const caseRevision of snapshot.cases) {
            const request = {
                evaluationRunId: runId,
                candidateId: candidate.candidateId,
                datasetSnapshotId: snapshot.snapshotId,
                caseRevision,
                baselineBundle,
                candidateBundle,
                randomSeed: 42,
                repeatIndex: 0
            }
            const result = await evaluator.runReplayCase(request)
            await evaluator.evaluateResult(request, result)
            caseResults.push(result)
        }
        const metrics = aggregateMetrics(caseResults)
        const blockingReasons: string[] = []
        if (metrics.candidateAccuracy < 0.95) blockingReasons.push('candidate_accuracy_below_95_percent')
        if (metrics.accuracyDelta <= 0) blockingReasons.push('no_accuracy_improvement')
        if (metrics.severeErrors > 0) blockingReasons.push('severe_errors_present')
        if (metrics.p95LatencyMs > 100) blockingReasons.push('p95_latency_exceeded')
        const evaluation: EvaluationRun = {
            runId,
            candidateId: candidate.candidateId,
            datasetSnapshotId: snapshot.snapshotId,
            baselineBundle,
            candidateBundle,
            status: blockingReasons.length ? 'failed' : 'passed',
            metrics,
            gate: {
                passed: blockingReasons.length === 0,
                decision: blockingReasons.length ? 'reject' : 'promote',
                blockingReasons
            },
            caseResults,
            startedAt: now,
            completedAt: now
        }
        await this.store.saveEvaluation(tenant, evaluation)
        return evaluation
    }

    private async approveCandidate(
        tenant: EvolutionTenantScope,
        candidate: EvolutionCandidate,
        evaluation: EvaluationRun,
        input: { actorId: string; actorRole: string },
        now: string
    ) {
        if (input.actorRole === 'agent') {
            throw new BadRequestException('Agent identity cannot satisfy a human approval decision')
        }
        const approval: ApprovalDecision = {
            approvalId: `APR-${candidate.candidateId}`,
            candidateId: candidate.candidateId,
            candidateHash: candidate.artifact.hash,
            evaluationRunId: evaluation.runId,
            scope: candidate.targetScope,
            decision: 'approved',
            actorId: input.actorId,
            actorRole: input.actorRole,
            reason: 'All conformance gates passed; approve immutable candidate hash for promotion.',
            decidedAt: now
        }
        await this.store.saveApproval(tenant, approval)
        return approval
    }

    private async createPromotedVersion(
        tenant: EvolutionTenantScope,
        simulationId: string,
        candidate: EvolutionCandidate,
        baseline: CapabilityVersion,
        actorId: string,
        now: string
    ) {
        const version: CapabilityVersion = {
            versionId: `CFM-${simulationId}-v${baseline.sequence + 1}`,
            targetId: candidate.targetId,
            sequence: baseline.sequence + 1,
            semanticVersion: `1.${baseline.sequence}.0`,
            artifact: candidate.artifact,
            providerKey: candidate.providerKey,
            providerVersion: candidate.providerVersion,
            dependencyVersionIds: candidate.dependencyVersionIds,
            sourceCandidateId: candidate.candidateId,
            createdAt: now,
            createdBy: actorId
        }
        await this.store.saveVersion(tenant, version)
        return version
    }

    private async createRelease(
        tenant: EvolutionTenantScope,
        simulationId: string,
        scope: EvolutionScope,
        candidate: EvolutionCandidate,
        evaluation: EvaluationRun,
        approval: ApprovalDecision,
        version: CapabilityVersion,
        baseline: CapabilityVersion,
        input: { actorId: string },
        now: string
    ) {
        const release: ReleasePackage = {
            releasePackageId: `RP-${simulationId}`,
            candidateId: candidate.candidateId,
            candidateHash: candidate.artifact.hash,
            targetId: candidate.targetId,
            targetVersionId: version.versionId,
            rollbackVersionId: baseline.versionId,
            evaluationRunId: evaluation.runId,
            scope,
            status: 'draft',
            approvalIds: [approval.approvalId],
            artifactHash: candidate.artifact.hash,
            providerKey: candidate.providerKey,
            providerVersion: candidate.providerVersion,
            shadowMinimumSamples: CONFORMANCE_FIELD_MAPPING_EXAMPLE.rollout.shadow.sampleCount,
            canaryPercent: CONFORMANCE_FIELD_MAPPING_EXAMPLE.rollout.canary.canaryPercent,
            createdAt: now,
            createdBy: input.actorId
        }
        await this.store.saveRelease(tenant, release)
        await this.store.transitionRelease(tenant, release.releasePackageId, 'pending_approval')
        const approved = await this.store.transitionRelease(tenant, release.releasePackageId, 'approved')
        return approved.value
    }

    private async runDeployment(
        tenant: EvolutionTenantScope,
        simulationId: string,
        release: ReleasePackage,
        channel: ReleaseDeployment['channel'],
        canaryPercent: number,
        sampleCount: number,
        observationCount: number,
        evaluation: EvaluationRun,
        now: string,
        startOffsetMs: number
    ) {
        const startedAt = addMilliseconds(now, startOffsetMs)
        const observations = buildRuntimeObservations({
            simulationId,
            channel,
            sampleCount,
            observationCount,
            caseResults: evaluation.caseResults,
            startedAt
        })
        const finalObservation = observations.at(-1)
        const deployment: ReleaseDeployment = {
            deploymentId: `DEP-${simulationId}-${channel}`,
            releasePackageId: release.releasePackageId,
            channel,
            scope: release.scope,
            status: channel === 'shadow' ? 'shadow' : 'canary',
            dataSource: 'deterministic_replay',
            sampleCount,
            candidateAccuracy: finalObservation?.candidateAccuracy ?? 0,
            severeErrors: finalObservation?.severeErrors ?? 0,
            canaryPercent,
            observations,
            startedAt,
            completedAt: finalObservation?.observedAt ?? startedAt
        }
        await this.store.saveDeployment(tenant, deployment)
        return deployment
    }

    private audit(
        tenant: EvolutionTenantScope,
        release: ReleasePackage,
        input: { actorId: string; actorRole: string },
        action: string,
        summary: string,
        now: string
    ) {
        const audit: EvolutionAuditEvent = {
            auditId: `AUD-${release.releasePackageId}-${action}`,
            releasePackageId: release.releasePackageId,
            candidateId: release.candidateId,
            action,
            actorId: input.actorId,
            actorRole: input.actorRole,
            summary,
            occurredAt: now
        }
        return this.store.saveAudit(tenant, audit)
    }
}

function aggregateMetrics(results: ReplayCaseResult[]): EvaluationMetrics {
    const baselinePassed = results.filter((result) => result.baselinePassed).length
    const candidatePassed = results.filter((result) => result.candidatePassed).length
    const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right)
    const percentileIndex = Math.max(0, Math.ceil(latencies.length * 0.95) - 1)
    const baselineAccuracy = results.length ? baselinePassed / results.length : 0
    const candidateAccuracy = results.length ? candidatePassed / results.length : 0
    return {
        baselineAccuracy,
        candidateAccuracy,
        accuracyDelta: candidateAccuracy - baselineAccuracy,
        severeErrors: results.filter((result) => result.severeError).length,
        p95LatencyMs: latencies[percentileIndex] ?? 0,
        averageCost: results.length ? results.reduce((sum, result) => sum + result.cost, 0) / results.length : 0,
        totalCases: results.length,
        passedCases: candidatePassed
    }
}

function buildRuntimeObservations(input: {
    simulationId: string
    channel: ReleaseDeployment['channel']
    sampleCount: number
    observationCount: number
    caseResults: ReplayCaseResult[]
    startedAt: string
}): ReleaseRuntimeObservation[] {
    if (!input.caseResults.length || input.sampleCount <= 0 || input.observationCount <= 0) {
        return []
    }
    return Array.from({ length: input.observationCount }, (_, index) => {
        const sequence = index + 1
        const sampleCount = Math.ceil((input.sampleCount * sequence) / input.observationCount)
        const samples = Array.from(
            { length: sampleCount },
            (_item, sampleIndex) => input.caseResults[sampleIndex % input.caseResults.length]
        )
        const baselinePassed = samples.filter((sample) => sample.baselinePassed).length
        const candidatePassed = samples.filter((sample) => sample.candidatePassed).length
        const latencies = samples.map((sample) => sample.latencyMs).sort((left, right) => left - right)
        const percentileIndex = Math.max(0, Math.ceil(latencies.length * 0.95) - 1)
        return {
            observationId: `OBS-${input.simulationId}-${input.channel}-${sequence}`,
            observedAt: addMilliseconds(input.startedAt, index * 60 * 1000),
            sequence,
            sampleCount,
            baselineAccuracy: baselinePassed / samples.length,
            candidateAccuracy: candidatePassed / samples.length,
            severeErrors: samples.filter((sample) => sample.severeError).length,
            p95LatencyMs: latencies[percentileIndex] ?? 0,
            averageCost: samples.reduce((sum, sample) => sum + sample.cost, 0) / samples.length
        }
    })
}

function addMilliseconds(value: string, milliseconds: number) {
    return new Date(new Date(value).getTime() + milliseconds).toISOString()
}

function toTenantScope(input: { tenantId: string; organizationId?: string | null }): EvolutionTenantScope {
    return {
        tenantId: input.tenantId,
        organizationId: input.organizationId ?? null
    }
}
