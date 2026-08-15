import { randomUUID } from 'crypto'
import type {
    ApprovalDecision,
    BuildCandidateCommand,
    CapabilityVersion,
    CapabilityVersionBundle,
    CreateDatasetSnapshotRequest,
    CreateEvolutionExperienceRequest,
    CreateEvolutionCanaryTestOverrideRequest,
    CreateImprovementProposalRequest,
    CreateReleasePackageRequest,
    DatasetSnapshot,
    DecideCandidateApprovalRequest,
    EvaluateCandidateCommand,
    EvaluationMetrics,
    EvaluationRun,
    EvolutionApprovalAuthority,
    EvolutionAuditEvent,
    EvolutionCanaryTestOverride,
    EvolutionCandidate,
    EvolutionExperience,
    EvolutionPageQuery,
    EvolutionProviderContext,
    EvolutionReleaseGatePolicy,
    EvolutionScope,
    GoldenCaseRevision,
    ImprovementProposal,
    ReleaseDeployment,
    ReleasePackage,
    ReplayCaseResult,
    StartDeploymentRequest
} from '@xpert-ai/contracts'
import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { t } from 'i18next'
import { hashEvolutionValue } from '../domain/evolution-hash'
import { AgentEvolutionReleaseGatePolicyService } from './agent-evolution-release-gate-policy.service'
import { AgentEvolutionStore, EvolutionTenantScope } from './agent-evolution.store'
import { AgentEvolutionQualityGovernanceService } from './agent-evolution-quality-governance.service'

export interface EvolutionCommandContext {
    tenantId: string
    organizationId?: string | null
    actorId: string
    actorRole: string
    actorRoleName?: string
    approvalAuthority?: EvolutionApprovalAuthority
    actorType?: 'human' | 'agent' | 'system'
    correlationId?: string
}

@Injectable()
export class AgentEvolutionGovernanceService {
    constructor(
        private readonly store: AgentEvolutionStore,
        private readonly providers: EvolutionTargetProviderRegistry,
        private readonly qualityGovernance: AgentEvolutionQualityGovernanceService,
        private readonly releaseGatePolicy: AgentEvolutionReleaseGatePolicyService
    ) {}

    listTargets(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listTargets(toTenantScope(context), query)
    }

    listLearningEvents(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listLearningEvents(toTenantScope(context), query)
    }

    listCapabilityVersions(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listCapabilityVersions(toTenantScope(context), query)
    }

    listCapabilityBundles(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listCapabilityBundles(toTenantScope(context), query)
    }

    listActivePointers(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listActivePointers(toTenantScope(context), query)
    }

    listProposals(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listProposals(toTenantScope(context), query)
    }

    listCandidates(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listCandidates(toTenantScope(context), query)
    }

    listDatasets(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listDatasets(toTenantScope(context), query)
    }

    listEvaluations(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listEvaluations(toTenantScope(context), query)
    }

    async listReleases(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        const page = await this.store.listReleases(toTenantScope(context), query)
        return {
            ...page,
            items: page.items.map((release) => ({
                ...release,
                gatePolicy: this.releaseGatePolicy.forRelease(release)
            }))
        }
    }

    listDeployments(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listDeployments(toTenantScope(context), query)
    }

    listCanaryTestOverrides(context: EvolutionCommandContext, releasePackageId: string) {
        return this.store.listCanaryTestOverrides(toTenantScope(context), releasePackageId)
    }

    async createCanaryTestOverride(
        context: EvolutionCommandContext,
        releasePackageId: string,
        request: CreateEvolutionCanaryTestOverrideRequest
    ) {
        requireHuman(context)
        if (context.approvalAuthority !== 'administrator') {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionCanaryTestOverrideRequiresAdministrator', {
                    defaultValue: 'Only SUPER_ADMIN or ADMIN can force a one-time Candidate assignment.'
                })
            )
        }
        const subjectKey = request.subjectKey?.trim()
        const reason = request.reason?.trim()
        if (!subjectKey || subjectKey.length > 200) {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionCanaryTestOverrideInvalidSubject', {
                    defaultValue: 'The test subject is required and must not exceed 200 characters.'
                })
            )
        }
        if (!reason || reason.length > 500) {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionCanaryTestOverrideInvalidReason', {
                    defaultValue: 'An audit reason is required and must not exceed 500 characters.'
                })
            )
        }
        const expiresInMinutes = request.expiresInMinutes ?? 30
        if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 120) {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionCanaryTestOverrideInvalidExpiry', {
                    defaultValue: 'The one-time override expiry must be between 1 and 120 minutes.'
                })
            )
        }

        const tenant = toTenantScope(context)
        const releaseEntity = await this.store.findRelease(tenant, releasePackageId)
        if (!releaseEntity) throw new NotFoundException('Release Package was not found')
        const release = releaseEntity.value
        if (release.gatePolicy?.profile !== 'manual_test' || !this.releaseGatePolicy.manualTestProfileEnabled()) {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionCanaryTestOverrideRequiresManualTestProfile', {
                    defaultValue: 'One-time Candidate assignment is available only for a manual-test release.'
                })
            )
        }
        if (release.status !== 'canary') {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionCanaryTestOverrideRequiresCanary', {
                    defaultValue: 'One-time Candidate assignment requires an active Canary deployment.'
                })
            )
        }
        const deployments = await this.store.listDeploymentsForRelease(tenant, releasePackageId)
        const deployment = deployments.find(
            (item) => item.channel === 'canary' && item.status === 'canary' && !item.value.completedAt
        )?.value
        if (!deployment) {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionCanaryTestOverrideRequiresCanary', {
                    defaultValue: 'One-time Candidate assignment requires an active Canary deployment.'
                })
            )
        }
        const overrides = await this.store.listCanaryTestOverrides(tenant, releasePackageId)
        const pending = overrides.find(
            (item) =>
                item.deploymentId === deployment.deploymentId &&
                item.subjectKey === subjectKey &&
                item.status === 'pending'
        )
        if (pending) {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionCanaryTestOverrideAlreadyPending', {
                    defaultValue: 'This subject already has a pending one-time Candidate assignment.'
                })
            )
        }

        const now = new Date()
        const override: EvolutionCanaryTestOverride = {
            overrideId: `CTO-${randomUUID()}`,
            releasePackageId,
            candidateId: release.candidateId,
            deploymentId: deployment.deploymentId,
            targetId: release.targetId,
            scope: release.scope,
            subjectKey,
            status: 'pending',
            reason,
            createdBy: context.actorId,
            createdByRole: context.actorRoleName ?? context.actorRole,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + expiresInMinutes * 60_000).toISOString()
        }
        const audit: EvolutionAuditEvent = {
            auditId: `AUD-${override.overrideId}-created`,
            releasePackageId,
            candidateId: release.candidateId,
            action: 'canary.manual_test_override_created',
            actorId: context.actorId,
            actorRole: context.actorRole,
            summary: `Administrator created a one-time manual-test Candidate override for subject '${subjectKey}'. Reason: ${reason}`,
            metadata: {
                manualTestOverrideId: override.overrideId,
                deploymentId: deployment.deploymentId,
                subjectKey,
                reason,
                overrideStatus: 'pending'
            },
            occurredAt: override.createdAt
        }
        return this.store.createCanaryTestOverride(tenant, override, audit)
    }

    listRuntimeObservations(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listRuntimeObservations(toTenantScope(context), query)
    }

    listAuditEvents(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listAuditEvents(toTenantScope(context), query)
    }

    listExperiences(context: EvolutionCommandContext, query: EvolutionPageQuery) {
        return this.store.listExperiences(toTenantScope(context), query)
    }

    reviewLearningEvent(
        context: EvolutionCommandContext,
        eventId: string,
        reviewStatus: 'pending' | 'ignored' | 'golden'
    ) {
        requireHuman(context)
        return this.store.reviewLearningEvent(toTenantScope(context), eventId, reviewStatus)
    }

    async createProposal(context: EvolutionCommandContext, request: CreateImprovementProposalRequest) {
        if (context.actorType === 'agent' && request.riskLevel === 'R4') {
            throw new BadRequestException('Agents cannot create an R4 proposal')
        }
        const tenant = toTenantScope(context)
        const events = await this.store.findLearningEvents(tenant, [...new Set(request.eventIds)])
        if (events.length !== new Set(request.eventIds).size) {
            throw new BadRequestException('One or more evidence events were not found in the current scope')
        }
        if (events.some((item) => item.targetId !== request.targetId)) {
            throw new BadRequestException('All evidence events must belong to the proposal target')
        }
        if (events.some((item) => !sameScope(item.value.scope, request.scope))) {
            throw new BadRequestException('All evidence events must belong to the exact proposal scope')
        }
        const minimumTime = Date.now() - 90 * 24 * 60 * 60 * 1000
        const qualifiedEvents = events.filter(
            (item) =>
                item.value.trustLevel !== 'L1' &&
                Number.isFinite(new Date(item.value.eventTime).getTime()) &&
                new Date(item.value.eventTime).getTime() >= minimumTime
        )
        if (qualifiedEvents.length < 3 || new Set(qualifiedEvents.map((item) => item.value.subjectRef)).size < 2) {
            throw new BadRequestException('Proposal requires three L2+ events across two subjects within 90 days')
        }
        const pointer = await this.store.findPointer(tenant, request.targetId, request.scope)
        if (!pointer)
            throw new BadRequestException('A Production capability pointer is required before proposing changes')
        const now = new Date().toISOString()
        const proposal: ImprovementProposal = {
            proposalId: `PROP-${randomUUID()}`,
            revision: 1,
            targetId: request.targetId,
            scope: request.scope,
            title: request.title,
            problemStatement: request.problemStatement,
            rootCause: request.rootCause,
            changeHypothesis: request.changeHypothesis,
            evidenceEventIds: qualifiedEvents.map((item) => item.eventId),
            baseVersionId: pointer.activeVersionId,
            riskLevel: request.riskLevel,
            status: 'ready',
            createdAt: now,
            createdBy: context.actorId
        }
        await this.store.saveProposal(tenant, proposal)
        return proposal
    }

    async buildCandidate(context: EvolutionCommandContext, command: BuildCandidateCommand) {
        const tenant = toTenantScope(context)
        const proposalEntity = await this.store.findProposal(tenant, command.proposalId, command.proposalRevision)
        if (!proposalEntity) throw new NotFoundException('Improvement proposal was not found')
        const proposal = proposalEntity.value
        if (proposal.status !== 'ready') throw new BadRequestException('Only a ready proposal can build a Candidate')
        const baselineEntity = await this.store.findVersion(tenant, proposal.baseVersionId)
        if (!baselineEntity) throw new NotFoundException('Proposal baseline capability version was not found')
        const provider = this.providers.get(proposal.targetId, context.organizationId ?? undefined)
        if (!provider.candidateBuilder || !provider.descriptor.capabilities.candidateBuild) {
            throw new BadRequestException(`Target '${proposal.targetId}' does not support Candidate construction`)
        }
        const providerContext = buildProviderContext(context, proposal.targetId, proposal.scope)
        const build = await provider.candidateBuilder.buildCandidate({
            context: providerContext,
            targetId: proposal.targetId,
            scope: proposal.scope,
            proposalId: proposal.proposalId,
            proposalRevision: proposal.revision,
            baseVersionId: proposal.baseVersionId,
            baseArtifact: baselineEntity.value.artifact,
            changeSet: command.changeSet,
            evidenceEventIds: proposal.evidenceEventIds,
            dependencyVersionIds: baselineEntity.value.dependencyVersionIds,
            actorId: context.actorId,
            idempotencyKey: `${proposal.proposalId}:${proposal.revision}`
        })
        const validation = await provider.candidateBuilder.validateCandidate({
            context: providerContext,
            targetId: proposal.targetId,
            scope: proposal.scope,
            artifact: build.artifact,
            baseVersionId: proposal.baseVersionId,
            baseArtifact: baselineEntity.value.artifact,
            dependencyVersionIds: build.dependencyVersionIds
        })
        if (!validation.valid) {
            throw new BadRequestException(`Candidate validation failed: ${validation.failureCodes.join(', ')}`)
        }
        const candidate: EvolutionCandidate = {
            candidateId: `CAND-${randomUUID()}`,
            targetId: proposal.targetId,
            baseVersionId: proposal.baseVersionId,
            proposalId: proposal.proposalId,
            proposalRevision: proposal.revision,
            artifact: build.artifact,
            providerKey: provider.descriptor.providerKey,
            providerVersion: provider.descriptor.providerVersion,
            dependencyVersionIds: build.dependencyVersionIds,
            targetScope: proposal.scope,
            buildInputsHash: build.buildInputsHash,
            status: 'building',
            createdBy: context.actorId,
            createdAt: new Date().toISOString()
        }
        await this.store.saveCandidate(tenant, candidate)
        const ready = await this.store.transitionCandidate(tenant, candidate.candidateId, 'ready')
        await this.store.updateProposalStatus(tenant, proposal.proposalId, proposal.revision, 'candidate_built')
        return ready.value
    }

    async createDatasetSnapshot(context: EvolutionCommandContext, request: CreateDatasetSnapshotRequest) {
        requireHuman(context)
        if (!request.cases.length) throw new BadRequestException('Golden Dataset must contain at least one case')
        const provider = this.providers.get(request.targetId, context.organizationId ?? undefined)
        if (!provider.replayEvaluator || !provider.descriptor.capabilities.replay) {
            throw new BadRequestException(`Target '${request.targetId}' does not support Golden Replay`)
        }
        if (!provider.descriptor.supportedScopes.includes(request.scope.type)) {
            throw new BadRequestException(`Target '${request.targetId}' does not support scope '${request.scope.type}'`)
        }
        assertUniqueCaseRevisions(request.cases)
        const now = new Date().toISOString()
        const snapshotId = `DS-${randomUUID()}`
        const snapshot: DatasetSnapshot = {
            snapshotId,
            datasetId: request.datasetId,
            targetId: request.targetId,
            scope: request.scope,
            name: request.name,
            evaluatorVersion: request.evaluatorVersion,
            metricDefinitionVersion: request.metricDefinitionVersion,
            cases: request.cases,
            snapshotHash: hashEvolutionValue(
                request.cases.map((item) => ({
                    caseId: item.caseId,
                    revision: item.revision,
                    evidenceRef: item.evidenceRef
                }))
            ),
            createdAt: now
        }
        await this.store.saveDataset(toTenantScope(context), snapshot)
        return snapshot
    }

    async evaluateCandidate(context: EvolutionCommandContext, command: EvaluateCandidateCommand) {
        const tenant = toTenantScope(context)
        const candidateEntity = await this.store.findCandidate(tenant, command.candidateId)
        const datasetEntity = await this.store.findDataset(tenant, command.datasetSnapshotId)
        if (!candidateEntity || !datasetEntity)
            throw new NotFoundException('Candidate or Dataset Snapshot was not found')
        const candidate = candidateEntity.value
        if (candidate.status !== 'ready') throw new BadRequestException('Only a ready Candidate can be evaluated')
        const dataset = datasetEntity.value
        if (!dataset.targetId || !dataset.scope) {
            throw new BadRequestException('Golden Dataset must declare an immutable target and scope')
        }
        if (dataset.targetId !== candidate.targetId) {
            throw new BadRequestException('Golden Dataset target does not match the Candidate target')
        }
        if (!sameScope(dataset.scope, candidate.targetScope)) {
            throw new BadRequestException('Golden Dataset scope does not match the Candidate scope')
        }
        const provider = this.providers.get(candidate.targetId, context.organizationId ?? undefined)
        if (!provider.replayEvaluator || !provider.descriptor.capabilities.replay) {
            throw new BadRequestException(`Target '${candidate.targetId}' does not support replay evaluation`)
        }
        const baselineEntity = await this.store.findVersion(tenant, candidate.baseVersionId)
        if (!baselineEntity) throw new NotFoundException('Candidate baseline version was not found')
        const now = new Date().toISOString()
        const baselineBundle = await this.createBundle(tenant, 'replay', [baselineEntity.value], now)
        const candidateBundle = await this.createCandidateBundle(tenant, candidate, now)
        await this.store.transitionCandidate(tenant, candidate.candidateId, 'evaluating')
        const runId = `ER-${randomUUID()}`
        const caseResults: ReplayCaseResult[] = []
        const providerContext = buildProviderContext(context, candidate.targetId, candidate.targetScope)
        for (const caseRevision of datasetEntity.value.cases) {
            const request = {
                context: providerContext,
                evaluationRunId: runId,
                candidateId: candidate.candidateId,
                datasetSnapshotId: datasetEntity.value.snapshotId,
                caseRevision,
                baselineBundle,
                candidateBundle,
                randomSeed: 42,
                repeatIndex: 0
            }
            const result = await provider.replayEvaluator.runReplayCase(request)
            await provider.replayEvaluator.evaluateResult(request, result)
            caseResults.push(result)
        }
        const metrics = aggregateMetrics(caseResults)
        const gate = this.qualityGovernance.reviewGoldenReplay(datasetEntity.value.cases, metrics)
        const evaluation: EvaluationRun = {
            runId,
            targetId: candidate.targetId,
            scope: candidate.targetScope,
            candidateId: candidate.candidateId,
            datasetSnapshotId: datasetEntity.value.snapshotId,
            baselineBundle,
            candidateBundle,
            status: gate.passed ? 'passed' : 'failed',
            metrics,
            gate,
            caseResults,
            startedAt: now,
            completedAt: new Date().toISOString()
        }
        await this.store.saveEvaluation(tenant, evaluation)
        await this.store.transitionCandidate(
            tenant,
            candidate.candidateId,
            evaluation.gate.passed ? 'pending_approval' : 'evaluation_failed'
        )
        return evaluation
    }

    async decideApproval(
        context: EvolutionCommandContext,
        candidateId: string,
        request: DecideCandidateApprovalRequest
    ) {
        requireHuman(context)
        const tenant = toTenantScope(context)
        const candidateEntity = await this.store.findCandidate(tenant, candidateId)
        const evaluationEntity = await this.store.findEvaluation(tenant, request.evaluationRunId)
        if (!candidateEntity || !evaluationEntity)
            throw new NotFoundException('Candidate or Evaluation Run was not found')
        const candidate = candidateEntity.value
        const evaluation = evaluationEntity.value
        if (candidate.status !== 'pending_approval') throw new BadRequestException('Candidate is not pending approval')
        if (request.decision === 'approved' && !evaluation.gate.passed) {
            throw new BadRequestException('A failed evaluation cannot be approved')
        }
        const approval: ApprovalDecision = {
            approvalId: `APR-${randomUUID()}`,
            candidateId,
            candidateHash: candidate.artifact.hash,
            evaluationRunId: evaluation.runId,
            scope: candidate.targetScope,
            decision: request.decision,
            actorId: context.actorId,
            actorRole: context.actorRole,
            actorRoleName: context.actorRoleName,
            approvalAuthority: context.approvalAuthority ?? 'standard',
            reason: request.reason,
            decidedAt: new Date().toISOString()
        }
        await this.store.saveApproval(tenant, approval)
        if (request.decision === 'rejected') {
            await this.store.transitionCandidate(tenant, candidateId, 'rejected')
        } else {
            const provider = this.providers.get(candidate.targetId, context.organizationId ?? undefined)
            const approvals = await this.store.listApprovalsForCandidate(tenant, candidateId)
            const approvalGate = this.qualityGovernance.reviewHumanApprovals(
                provider.descriptor.riskLevel,
                approvals.map((item) => item.value)
            )
            if (approvalGate.passed) {
                await this.store.transitionCandidate(tenant, candidateId, 'approved')
            }
        }
        return approval
    }

    async createReleasePackage(context: EvolutionCommandContext, request: CreateReleasePackageRequest) {
        requireHuman(context)
        const tenant = toTenantScope(context)
        const candidateEntity = await this.store.findCandidate(tenant, request.candidateId)
        const evaluationEntity = await this.store.findEvaluation(tenant, request.evaluationRunId)
        if (!candidateEntity || !evaluationEntity)
            throw new NotFoundException('Candidate or Evaluation Run was not found')
        const candidate = candidateEntity.value
        if (candidate.status !== 'approved' || !evaluationEntity.value.gate.passed) {
            throw new BadRequestException('Release packaging requires an approved Candidate and passed Evaluation Run')
        }
        const approvals = await Promise.all(request.approvalIds.map((id) => this.store.findApproval(tenant, id)))
        if (approvals.some((item) => !item || item.value.candidateHash !== candidate.artifact.hash)) {
            throw new BadRequestException('Approval set does not match the immutable Candidate hash')
        }
        const provider = this.providers.get(candidate.targetId, context.organizationId ?? undefined)
        const approvedDecisions = approvals
            .filter((item): item is NonNullable<typeof item> => !!item && item.value.decision === 'approved')
            .map((item) => item.value)
        const approvalGate = this.qualityGovernance.reviewHumanApprovals(
            provider.descriptor.riskLevel,
            approvedDecisions
        )
        if (!approvalGate.passed) {
            throw new BadRequestException(
                `Release requires one SUPER_ADMIN/ADMIN approval or ${approvalGate.requiredApprovals} distinct human approvers from ${approvalGate.requiredApprovals} distinct roles`
            )
        }
        if (!provider.releaseProvider || !provider.descriptor.capabilities.install) {
            throw new BadRequestException(`Target '${candidate.targetId}' does not support release installation`)
        }
        const gatePolicy = this.releaseGatePolicy.snapshot(request.shadowMinimumSamples)
        this.requireGatePolicyAuthority(context, gatePolicy)
        const baselineEntity = await this.store.findVersion(tenant, candidate.baseVersionId)
        const latestVersion = await this.store.findLatestVersionForTarget(tenant, candidate.targetId)
        if (!baselineEntity) throw new NotFoundException('Release baseline version was not found')
        const now = new Date().toISOString()
        const sequence = (latestVersion?.value.sequence ?? 0) + 1
        const version: CapabilityVersion = {
            versionId: `${candidate.targetId}:v${sequence}`,
            targetId: candidate.targetId,
            sequence,
            semanticVersion: `1.${sequence - 1}.0`,
            artifact: candidate.artifact,
            providerKey: candidate.providerKey,
            providerVersion: candidate.providerVersion,
            dependencyVersionIds: candidate.dependencyVersionIds,
            sourceCandidateId: candidate.candidateId,
            createdAt: now,
            createdBy: context.actorId
        }
        await this.store.saveVersion(tenant, version)
        const release: ReleasePackage = {
            releasePackageId: `RP-${randomUUID()}`,
            candidateId: candidate.candidateId,
            candidateHash: candidate.artifact.hash,
            targetId: candidate.targetId,
            targetVersionId: version.versionId,
            rollbackVersionId: baselineEntity.value.versionId,
            evaluationRunId: evaluationEntity.value.runId,
            scope: candidate.targetScope,
            status: 'draft',
            approvalIds: request.approvalIds,
            artifactHash: candidate.artifact.hash,
            providerKey: candidate.providerKey,
            providerVersion: candidate.providerVersion,
            gatePolicy,
            shadowMinimumSamples: gatePolicy.shadowMinimumSamples,
            canaryPercent: 0,
            createdAt: now,
            createdBy: context.actorId
        }
        await this.store.saveRelease(tenant, release)
        await this.store.transitionRelease(tenant, release.releasePackageId, 'pending_approval')
        const approved = await this.store.transitionRelease(tenant, release.releasePackageId, 'approved')
        await this.store.transitionCandidate(tenant, candidate.candidateId, 'packaged')
        await this.audit(
            tenant,
            approved.value,
            context,
            'release.packaged',
            'Immutable Candidate packaged for installation'
        )
        return approved.value
    }

    async installRelease(context: EvolutionCommandContext, releasePackageId: string) {
        requireHuman(context)
        const { tenant, release, releaseProvider } = await this.releaseOperationContext(
            context,
            releasePackageId,
            'install'
        )
        if (release.status !== 'approved')
            throw new BadRequestException('Only an approved Release Package can be installed')
        await releaseProvider.install(releaseProviderRequest(context, release, `${release.releasePackageId}:install`))
        const installed = await this.store.transitionRelease(tenant, releasePackageId, 'installed')
        await this.audit(
            tenant,
            installed.value,
            context,
            'release.installed',
            'Immutable capability version installed'
        )
        return installed.value
    }

    async startShadow(context: EvolutionCommandContext, releasePackageId: string) {
        requireHuman(context)
        const operation = await this.releaseOperationContext(context, releasePackageId, 'shadow')
        const { tenant, provider } = operation
        const release = await this.freezeReleaseGatePolicy(tenant, operation.release, context)
        if (!provider.descriptor.capabilities.shadow) throw new BadRequestException('Target does not support Shadow')
        if (release.status !== 'installed' && release.status !== 'paused') {
            throw new BadRequestException('Shadow can start only from installed or paused')
        }
        const deployment = await this.createDeployment(tenant, release, 'shadow', 0)
        const transitioned = await this.store.transitionRelease(tenant, releasePackageId, 'shadow')
        await this.audit(tenant, transitioned.value, context, 'deployment.shadow_started', 'Shadow deployment started')
        return deployment
    }

    async startCanary(context: EvolutionCommandContext, releasePackageId: string, request: StartDeploymentRequest) {
        requireHuman(context)
        const percent = request.canaryPercent
        if (percent !== 5 && percent !== 25 && percent !== 50) {
            throw new BadRequestException('Canary percent must be 5, 25 or 50')
        }
        const operation = await this.releaseOperationContext(context, releasePackageId, 'canary')
        const { tenant, provider } = operation
        const release = await this.freezeReleaseGatePolicy(tenant, operation.release, context)
        const gatePolicy = release.gatePolicy
        if (!gatePolicy) throw new BadRequestException('Release gate policy was not frozen')
        if (!provider.descriptor.capabilities.canary) throw new BadRequestException('Target does not support Canary')
        const deployments = await this.store.listDeploymentsForRelease(tenant, releasePackageId)
        const latest = deployments[0]?.value
        if (release.status === 'shadow' || (release.status === 'paused' && latest?.channel === 'shadow')) {
            if (percent !== 5) throw new BadRequestException('The first Canary stage must be 5%')
            if (
                !latest ||
                latest.channel !== 'shadow' ||
                latest.sampleCount < gatePolicy.shadowMinimumSamples ||
                latest.severeErrors > 0 ||
                !minimumElapsed(latest.startedAt, gatePolicy.shadowMinimumDurationHours)
            ) {
                throw new BadRequestException(
                    t('server-ai:Error.AgentEvolutionShadowGateNotSatisfied', {
                        defaultValue:
                            'Shadow requires {{hours}} hours, {{samples}} observations and zero severe errors.',
                        hours: gatePolicy.shadowMinimumDurationHours,
                        samples: gatePolicy.shadowMinimumSamples
                    })
                )
            }
        } else if (release.status === 'canary' || (release.status === 'paused' && latest?.channel === 'canary')) {
            const expectedNext = latest?.canaryPercent === 5 ? 25 : latest?.canaryPercent === 25 ? 50 : null
            if (
                expectedNext !== percent ||
                (latest?.sampleCount ?? 0) < gatePolicy.canaryMinimumSamples ||
                (latest?.severeErrors ?? 0) > 0 ||
                !minimumElapsed(latest?.startedAt, gatePolicy.canaryMinimumDurationHours)
            ) {
                throw new BadRequestException(
                    t('server-ai:Error.AgentEvolutionCanaryGateNotSatisfied', {
                        defaultValue:
                            'Canary expansion requires {{hours}} hours, {{samples}} observations and zero severe errors.',
                        hours: gatePolicy.canaryMinimumDurationHours,
                        samples: gatePolicy.canaryMinimumSamples
                    })
                )
            }
        } else {
            throw new BadRequestException('Canary can start only after Shadow or resume from paused')
        }
        if (latest) await this.store.completeDeployment(tenant, latest.deploymentId, new Date().toISOString())
        const deployment = await this.createDeployment(tenant, release, 'canary', percent)
        if (release.status !== 'canary') await this.store.transitionRelease(tenant, releasePackageId, 'canary')
        const updatedRelease: ReleasePackage = { ...release, status: 'canary', canaryPercent: percent }
        await this.store.saveRelease(tenant, updatedRelease)
        await this.audit(tenant, updatedRelease, context, 'deployment.canary_started', `Canary ${percent}% started`)
        return deployment
    }

    async pauseRelease(context: EvolutionCommandContext, releasePackageId: string) {
        requireHuman(context)
        const tenant = toTenantScope(context)
        const entity = await this.store.findRelease(tenant, releasePackageId)
        if (!entity || (entity.status !== 'shadow' && entity.status !== 'canary')) {
            throw new BadRequestException('Only Shadow or Canary can be paused')
        }
        const paused = await this.store.transitionRelease(tenant, releasePackageId, 'paused')
        await this.audit(tenant, paused.value, context, 'deployment.paused', 'Release deployment paused')
        return paused.value
    }

    async activateProduction(context: EvolutionCommandContext, releasePackageId: string) {
        requireHuman(context)
        const operation = await this.releaseOperationContext(context, releasePackageId, 'activate')
        const { tenant, releaseProvider } = operation
        const release = await this.freezeReleaseGatePolicy(tenant, operation.release, context)
        const gatePolicy = release.gatePolicy
        if (!gatePolicy) throw new BadRequestException('Release gate policy was not frozen')
        if (release.status !== 'canary') throw new BadRequestException('Production activation requires Canary')
        const deployments = await this.store.listDeploymentsForRelease(tenant, releasePackageId)
        const latest = deployments.find((item) => item.channel === 'canary')?.value
        if (
            !latest ||
            latest.canaryPercent !== 50 ||
            latest.sampleCount < gatePolicy.productionCanaryMinimumSamples ||
            latest.severeErrors > 0 ||
            !minimumElapsed(latest.startedAt, gatePolicy.productionCanaryMinimumDurationHours)
        ) {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionProductionGateNotSatisfied', {
                    defaultValue:
                        'Production activation requires a passing 50% Canary gate for {{hours}} hours and {{samples}} observations.',
                    hours: gatePolicy.productionCanaryMinimumDurationHours,
                    samples: gatePolicy.productionCanaryMinimumSamples
                })
            )
        }
        await this.store.completeDeployment(tenant, latest.deploymentId, new Date().toISOString())
        const pointer = await this.store.findPointer(tenant, release.targetId, release.scope)
        if (!pointer || pointer.activeVersionId !== release.rollbackVersionId) {
            throw new BadRequestException('Production pointer no longer matches the approved rollback version')
        }
        await releaseProvider.activate(
            releaseProviderRequest(context, release, `${release.releasePackageId}:activate:${pointer.revision}`)
        )
        const activated = await this.store.activatePointerCas({
            tenant,
            pointerId: pointer.pointerId,
            expectedRevision: pointer.revision,
            expectedVersionId: pointer.activeVersionId,
            newVersionId: release.targetVersionId,
            releasePackageId,
            actorId: context.actorId,
            actorRole: context.actorRole,
            occurredAt: new Date().toISOString()
        })
        await this.createDeployment(tenant, { ...release, status: 'active' }, 'production', 100)
        return activated
    }

    async rollbackProduction(context: EvolutionCommandContext, releasePackageId: string) {
        if (context.actorType === 'agent') throw new BadRequestException('Agents cannot initiate Production rollback')
        const { tenant, release, provider, releaseProvider } = await this.releaseOperationContext(
            context,
            releasePackageId,
            'rollback'
        )
        if (!provider.descriptor.capabilities.rollback)
            throw new BadRequestException('Target does not support rollback')
        const pointer = await this.store.findPointer(tenant, release.targetId, release.scope)
        if (!pointer || pointer.activeVersionId !== release.targetVersionId) {
            throw new BadRequestException('Release is not the active Production version')
        }
        await releaseProvider.rollback(
            releaseProviderRequest(context, release, `${release.releasePackageId}:rollback:${pointer.revision}`)
        )
        return this.store.rollbackPointerCas({
            tenant,
            pointerId: pointer.pointerId,
            expectedRevision: pointer.revision,
            expectedVersionId: pointer.activeVersionId,
            rollbackVersionId: release.rollbackVersionId,
            releasePackageId,
            actorId: context.actorId,
            actorRole: context.actorRole,
            occurredAt: new Date().toISOString()
        })
    }

    async createExperience(context: EvolutionCommandContext, request: CreateEvolutionExperienceRequest) {
        requireHuman(context)
        const tenant = toTenantScope(context)
        const releaseEntity = await this.store.findRelease(tenant, request.releasePackageId)
        if (!releaseEntity || releaseEntity.status !== 'active') {
            throw new BadRequestException('Experience requires an active Production Release')
        }
        const release = await this.freezeReleaseGatePolicy(tenant, releaseEntity.value, context)
        const gatePolicy = release.gatePolicy
        if (!gatePolicy) throw new BadRequestException('Release gate policy was not frozen')
        const deployments = await this.store.listDeploymentsForRelease(tenant, release.releasePackageId)
        const production = deployments.find((item) => item.channel === 'production' && item.status === 'active')?.value
        if (
            !production ||
            production.sampleCount < gatePolicy.experienceMinimumSamples ||
            production.severeErrors > 0 ||
            !minimumElapsed(production.startedAt, gatePolicy.experienceMinimumDurationHours)
        ) {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionExperienceGateNotSatisfied', {
                    defaultValue:
                        'Experience requires {{hours}} stable hours, {{samples}} Production observations and zero severe errors.',
                    hours: gatePolicy.experienceMinimumDurationHours,
                    samples: gatePolicy.experienceMinimumSamples
                })
            )
        }
        const evaluation = await this.store.findEvaluation(tenant, release.evaluationRunId)
        if (!evaluation) throw new NotFoundException('Release Evaluation Run was not found')
        const experience: EvolutionExperience = {
            experienceId: `EXP-${randomUUID()}`,
            targetId: release.targetId,
            scope: release.scope,
            sourceReleasePackageId: release.releasePackageId,
            sourceCandidateId: release.candidateId,
            evidence: {
                productionObservationCount: production.sampleCount,
                severeErrors: production.severeErrors,
                stableDays: gatePolicy.experienceMinimumDurationHours / 24,
                evaluationRunId: evaluation.value.runId
            },
            summary: `Validated ${release.targetId} Candidate ${release.candidateId} after Golden Replay and stable Production telemetry.`,
            status: 'active',
            createdAt: new Date().toISOString(),
            createdBy: context.actorId
        }
        return (await this.store.saveExperience(tenant, experience)).value
    }

    private async freezeReleaseGatePolicy(
        tenant: EvolutionTenantScope,
        release: ReleasePackage,
        context: EvolutionCommandContext
    ) {
        const gatePolicy = this.releaseGatePolicy.forRelease(release)
        this.requireGatePolicyAuthority(context, gatePolicy)
        if (release.gatePolicy) return release

        const frozen: ReleasePackage = {
            ...release,
            gatePolicy,
            shadowMinimumSamples: gatePolicy.shadowMinimumSamples
        }
        await this.store.saveRelease(tenant, frozen)
        await this.audit(
            tenant,
            frozen,
            context,
            'release.gate_policy_frozen',
            t('server-ai:AgentEvolution.GatePolicyFrozen', {
                defaultValue: 'Release gate policy frozen as {{profile}}.',
                profile: gatePolicy.profile
            })
        )
        return frozen
    }

    private requireGatePolicyAuthority(context: EvolutionCommandContext, gatePolicy: EvolutionReleaseGatePolicy) {
        if (gatePolicy.profile === 'manual_test' && context.approvalAuthority !== 'administrator') {
            throw new BadRequestException(
                t('server-ai:Error.AgentEvolutionManualTestGateRequiresAdministrator', {
                    defaultValue: 'The manual-test release gate profile requires SUPER_ADMIN or ADMIN.'
                })
            )
        }
    }

    private async releaseOperationContext(
        context: EvolutionCommandContext,
        releasePackageId: string,
        operation: 'install' | 'shadow' | 'canary' | 'activate' | 'rollback'
    ) {
        const tenant = toTenantScope(context)
        const entity = await this.store.findRelease(tenant, releasePackageId)
        if (!entity) throw new NotFoundException('Release Package was not found')
        const release = entity.value
        const provider = this.providers.get(release.targetId, context.organizationId ?? undefined)
        const releaseProvider = provider.releaseProvider
        if (!releaseProvider) throw new BadRequestException(`Release Provider is required for ${operation}`)
        return { tenant, release, provider, releaseProvider }
    }

    private async createBundle(
        tenant: EvolutionTenantScope,
        executionMode: CapabilityVersionBundle['executionMode'],
        versions: CapabilityVersion[],
        createdAt: string
    ) {
        const items = versions.map((version) => ({
            targetId: version.targetId,
            versionId: version.versionId,
            artifactHash: version.artifact.hash,
            providerKey: version.providerKey,
            providerVersion: version.providerVersion
        }))
        const bundle: CapabilityVersionBundle = {
            bundleId: `BND-${randomUUID()}`,
            bundleHash: hashEvolutionValue(items),
            executionMode,
            items,
            createdAt
        }
        await this.store.saveBundle(tenant, bundle)
        return bundle
    }

    private async createCandidateBundle(
        tenant: EvolutionTenantScope,
        candidate: EvolutionCandidate,
        createdAt: string
    ) {
        const item = {
            targetId: candidate.targetId,
            versionId: candidate.candidateId,
            artifactHash: candidate.artifact.hash,
            providerKey: candidate.providerKey,
            providerVersion: candidate.providerVersion
        }
        const bundle: CapabilityVersionBundle = {
            bundleId: `BND-${randomUUID()}`,
            bundleHash: hashEvolutionValue([item]),
            executionMode: 'replay',
            items: [item],
            createdAt
        }
        await this.store.saveBundle(tenant, bundle)
        return bundle
    }

    private async createDeployment(
        tenant: EvolutionTenantScope,
        release: ReleasePackage,
        channel: ReleaseDeployment['channel'],
        canaryPercent: number
    ) {
        const now = new Date().toISOString()
        const deployment: ReleaseDeployment = {
            deploymentId: `DEP-${release.releasePackageId}-${channel}-${canaryPercent}-${randomUUID().slice(0, 8)}`,
            releasePackageId: release.releasePackageId,
            channel,
            scope: release.scope,
            status: channel === 'shadow' ? 'shadow' : channel === 'canary' ? 'canary' : 'active',
            dataSource: 'runtime_telemetry',
            sampleCount: 0,
            candidateAccuracy: 0,
            severeErrors: 0,
            canaryPercent,
            observations: [],
            startedAt: now
        }
        await this.store.saveDeployment(tenant, deployment)
        return deployment
    }

    private audit(
        tenant: EvolutionTenantScope,
        release: ReleasePackage,
        context: EvolutionCommandContext,
        action: string,
        summary: string
    ) {
        const audit: EvolutionAuditEvent = {
            auditId: `AUD-${randomUUID()}`,
            releasePackageId: release.releasePackageId,
            candidateId: release.candidateId,
            action,
            actorId: context.actorId,
            actorRole: context.actorRole,
            summary,
            occurredAt: new Date().toISOString()
        }
        return this.store.saveAudit(tenant, audit)
    }
}

function buildProviderContext(
    context: EvolutionCommandContext,
    targetId: string,
    scope: EvolutionScope
): EvolutionProviderContext {
    return {
        tenantId: context.tenantId,
        organizationId: context.organizationId ?? null,
        targetId,
        scope,
        correlationId: context.correlationId ?? randomUUID(),
        actor: {
            actorId: context.actorId,
            actorType: context.actorType ?? 'human',
            actorRole: context.actorRole
        }
    }
}

function releaseProviderRequest(context: EvolutionCommandContext, release: ReleasePackage, idempotencyKey: string) {
    return {
        context: buildProviderContext(context, release.targetId, release.scope),
        targetId: release.targetId,
        versionId: release.targetVersionId,
        artifactHash: release.artifactHash,
        scope: release.scope,
        releasePackageId: release.releasePackageId,
        actorId: context.actorId,
        idempotencyKey
    }
}

function requireHuman(context: EvolutionCommandContext) {
    if (context.actorType === 'agent') throw new BadRequestException('This governance action requires a human actor')
}

function minimumElapsed(startedAt: string | undefined, hours: number) {
    if (!startedAt) return false
    const started = Date.parse(startedAt)
    return Number.isFinite(started) && Date.now() - started >= hours * 60 * 60 * 1000
}

function assertUniqueCaseRevisions(cases: GoldenCaseRevision[]) {
    const keys = cases.map((item) => `${item.caseId}:${item.revision}`)
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Golden Dataset contains duplicate cases')
}

function sameScope(left: EvolutionScope, right: EvolutionScope) {
    return (
        left.type === right.type &&
        left.key === right.key &&
        JSON.stringify(sortedDimensions(left.dimensions)) === JSON.stringify(sortedDimensions(right.dimensions))
    )
}

function sortedDimensions(dimensions: EvolutionScope['dimensions']) {
    return Object.fromEntries(Object.entries(dimensions ?? {}).sort(([left], [right]) => left.localeCompare(right)))
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

function toTenantScope(input: { tenantId: string; organizationId?: string | null }): EvolutionTenantScope {
    return { tenantId: input.tenantId, organizationId: input.organizationId ?? null }
}
