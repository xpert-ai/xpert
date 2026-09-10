import { EvolutionChangeService, digest } from '../changes/change.service'
import { isEvidenceProposal } from '@xpert-ai/contracts'
import {
    buildProviderContext,
    releaseProviderRequest,
    requireHuman,
    minimumElapsed,
    assertUniqueCaseRevisions,
    sameScope,
    sortedDimensions,
    aggregateMetrics,
    toTenantScope
} from './evolution-governance.helpers'
import { changeError } from '../changes/change.errors'
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
        private readonly releaseGatePolicy: AgentEvolutionReleaseGatePolicyService,
        private readonly changes: EvolutionChangeService
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
        if (context.actorType === 'agent' && request.riskLevel === 'R4') changeError('agent_proposal_risk_forbidden')
        const identity = this.changeIdentity(context)
        const pointer = await this.store.findPointer(identity, request.targetId, request.scope)
        if (!pointer) changeError('production_baseline_required')
        const baseline = await this.store.findVersion(identity, pointer.activeVersionId)
        if (!baseline) changeError('candidate_baseline_mismatch')
        const events = await this.store.findLearningEvents(identity, [...new Set(request.eventIds)])
        const change = await this.changes.prepare(
            {
                ...identity,
                strategyId: request.strategyId,
                sourceKind: 'learning_events',
                targetId: request.targetId,
                requestId: `PROP-REQUEST-${randomUUID()}`,
                scope: request.scope,
                baseline: {
                    resourceId: baseline.value.versionId,
                    version: baseline.value.semanticVersion,
                    hash: baseline.value.artifact.hash
                },
                learningEventIds: request.eventIds,
                evidence: events.map(({ value }) => ({
                    kind: 'execution',
                    subjectKey: value.subjectRef,
                    uri: `evolution-event:${value.eventId}`,
                    version: value.schemaVersion,
                    hash: digest(value)
                }))
            },
            { defer: true }
        )
        const prior = await this.store.findProposal(identity, `PROP-${change.changeId}`, 1)
        if (!prior) changeError('change_not_found')
        const proposal: ImprovementProposal = {
            ...prior.value,
            title: request.title,
            problemStatement: request.problemStatement,
            rootCause: request.rootCause,
            changeHypothesis: request.changeHypothesis,
            riskLevel: request.riskLevel
        }
        await this.store.saveProposal(identity, proposal)
        return proposal
    }

    async buildCandidate(context: EvolutionCommandContext, command: BuildCandidateCommand) {
        const identity = this.changeIdentity(context)
        const row = await this.store.findProposal(identity, command.proposalId, command.proposalRevision)
        if (!row || !isEvidenceProposal(row.value)) changeError('change_not_found')
        const result = await this.changes.build({
            ...identity,
            changeId: row.value.candidateId,
            candidateInput: command.changeSet
        })
        const candidate = await this.store.findCandidate(identity, result.changeId)
        if (!candidate) changeError('candidate_snapshot_mismatch')
        return candidate.value
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
        const identity = this.changeIdentity(context)
        const change = await this.changes.get({ ...identity, changeId: command.candidateId })
        const step = change.strategy.definition.evaluations.find((item) => item.kind === 'golden_replay')
        if (!step) changeError('evaluation_not_in_strategy')
        const result = await this.changes.evaluate({
            ...identity,
            changeId: change.changeId,
            datasetSnapshotIds: { [step.key]: command.datasetSnapshotId }
        })
        const rawId = result.evaluation?.checks
            .flatMap((check) => check.evidenceRefs)
            .find((id) => id.startsWith('ER-'))
        const evaluation = rawId ? await this.store.findEvaluation(identity, rawId) : null
        if (!evaluation) changeError('evaluation_snapshot_mismatch')
        return evaluation.value
    }

    async decideApproval(
        context: EvolutionCommandContext,
        candidateId: string,
        request: DecideCandidateApprovalRequest
    ) {
        const identity = this.changeIdentity(context)
        const change = await this.changes.get({ ...identity, changeId: candidateId })
        if (
            !change.candidate ||
            !change.evaluation ||
            (request.evaluationRunId !== change.evaluation.runId &&
                !change.evaluation.checks.some((item) => item.evidenceRefs.includes(request.evaluationRunId)))
        )
            changeError('review_snapshot_mismatch')
        const result = await this.changes.decide({
            ...identity,
            changeId: candidateId,
            candidateHash: change.candidate.artifact.hash,
            evaluationRunId: change.evaluation.runId,
            decision: request.decision,
            reason: request.reason
        })
        return result.approval!
    }

    async createReleasePackage(context: EvolutionCommandContext, request: CreateReleasePackageRequest) {
        const identity = this.changeIdentity(context)
        const change = await this.changes.get({ ...identity, changeId: request.candidateId })
        if (change.strategy.definition.publication.mode !== 'staged_rollout') changeError('publication_not_in_strategy')
        if (
            !change.evaluation ||
            (request.evaluationRunId !== change.evaluation.runId &&
                !change.evaluation.checks.some((item) => item.evidenceRefs.includes(request.evaluationRunId)))
        )
            changeError('evaluation_snapshot_mismatch')
        await this.changes.publish({ ...identity, changeId: request.candidateId })
        const release = await this.store.findRelease(identity, `PUB-${request.candidateId}`)
        if (!release) changeError('publication_snapshot_mismatch')
        return release.value
    }

    private changeIdentity(context: EvolutionCommandContext) {
        if (!context.organizationId) changeError('identity_mismatch')
        return { tenantId: context.tenantId, organizationId: context.organizationId }
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
        const change = await this.changes.get({ ...this.changeIdentity(context), changeId: release.candidateId })
        const evaluation = change.evaluation
        if (!evaluation?.passed || evaluation.runId !== release.evaluationRunId) {
            throw new BadRequestException('Release strategy assessment does not match')
        }
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
                evaluationRunId: evaluation.runId
            },
            summary: `Validated ${release.targetId} Candidate ${release.candidateId} after strategy assessment and stable Production telemetry.`,
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
        return release
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
