// One coordinator owns every strategy's candidate, assessment, approval and publication intent.
// Provider writes remain idempotent across a committed write and a failed platform receipt.
import { createHash, randomUUID } from 'crypto'
import { Inject, Injectable, Optional, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type {
    ApprovalDecision,
    EvolutionActor,
    EvolutionChange,
    EvolutionChangeIdentity,
    EvolutionChangeOperation,
    EvolutionChangeRuntimeApi,
    EvolutionTargetProvider,
    SubmitEvolutionChange
} from '@xpert-ai/contracts'
import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import {
    EvolutionChangeRuntimeCapability,
    EvolutionTargetProviderRegistry,
    MANAGED_QUEUE_SERVICE_TOKEN,
    type ManagedQueueService
} from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
import { DataSource, EntityManager } from 'typeorm'
import { RuntimeCapabilityProvider } from '../../shared/runtime'
import { AgentEvolutionStore } from '../application/agent-evolution.store'
import { AgentEvolutionQualityGovernanceService } from '../application/agent-evolution-quality-governance.service'
import { sameScope } from '../application/evolution-governance.helpers'
import { ApprovalDecisionEntity, EvolutionAuditEventEntity } from '../entities/evolution.entities'
import { EvolutionChangeStore } from './change.store'
import { EvolutionStrategyService, initialStages, qualifiesLearning, setStage } from './strategy.service'
import { EvolutionEvaluationExecutor } from './evaluation-executor.service'
import { EvolutionPublicationExecutor } from './publication-executor.service'
import { changeError } from './change.errors'
import { validateChangeInput } from './change.validation'

export const CHANGE_QUEUE = {
    pluginName: '@xpert-ai/platform',
    queueName: 'agent-evolution',
    jobName: 'change_preparation'
}

@Injectable()
@RuntimeCapabilityProvider(EvolutionChangeRuntimeCapability)
export class EvolutionChangeService implements EvolutionChangeRuntimeApi {
    private readonly logger = new Logger(EvolutionChangeService.name)
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly providers: EvolutionTargetProviderRegistry,
        private readonly store: AgentEvolutionStore,
        private readonly records: EvolutionChangeStore,
        private readonly strategies: EvolutionStrategyService,
        private readonly evaluations: EvolutionEvaluationExecutor,
        private readonly publication: EvolutionPublicationExecutor,
        private readonly quality: AgentEvolutionQualityGovernanceService,
        @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService
    ) {}

    async prepare(input: SubmitEvolutionChange, options: { defer?: boolean } = {}) {
        this.checkIdentity(input)
        const target = this.providers.get(input.targetId, input.organizationId)
        const strategy = this.strategies.freeze(
            input.targetId,
            input.organizationId,
            input.strategyId,
            input.sourceKind
        )
        if (!target.descriptor.supportedScopes.includes(input.scope.type)) changeError('invalid_scope_or_baseline')
        validateChangeInput(input, strategy.definition)
        if (input.sourceKind === 'manual') this.human(input)
        const learningEventIds = [...new Set(input.learningEventIds ?? [])]
        if (strategy.definition.learning.mode === 'feedback') {
            const events = await this.store.findLearningEvents(input, learningEventIds)
            if (
                events.length !== learningEventIds.length ||
                events.some(({ value }) => value.targetId !== input.targetId || !sameScope(value.scope, input.scope)) ||
                !qualifiesLearning(
                    events.map(({ value }) => value),
                    strategy.definition
                )
            )
                changeError('learning_evidence_gate_failed')
            const actualEvidence = events.map(({ value }) => ({
                kind: 'execution' as const,
                subjectKey: value.subjectRef,
                uri: `evolution-event:${value.eventId}`,
                version: value.schemaVersion,
                hash: digest(value)
            }))
            if (
                digest(actualEvidence.sort((a, b) => a.uri.localeCompare(b.uri))) !==
                digest([...input.evidence].sort((a, b) => a.uri.localeCompare(b.uri)))
            )
                changeError('learning_evidence_snapshot_mismatch')
        } else if (learningEventIds.length) changeError('unexpected_learning_events')
        const now = new Date().toISOString()
        const changeId = `EVO-${randomUUID()}`
        const change: EvolutionChange = {
            contractVersion: 3,
            strategy,
            sourceKind: input.sourceKind,
            learningEventIds,
            candidateInput: input.candidateInput ?? {},
            datasetSnapshotIds: input.datasetSnapshotIds ?? {},
            stages: initialStages(strategy.definition),
            changeId,
            targetId: input.targetId,
            requestId: input.requestId,
            scope: input.scope,
            baseline: input.baseline,
            evidence: input.evidence,
            evidenceHash: digest(input.evidence),
            status: 'preparing',
            jobId: `EVOJOB-${changeId}`,
            createdBy: RequestContext.currentUserId() ?? 'system',
            createdAt: now,
            updatedAt: now
        }
        const record = await this.records.create(input, change)
        if (record.changeId === changeId)
            await this.store.saveJob(input, {
                jobId: record.jobId,
                jobType: 'change_preparation',
                resourceId: record.changeId,
                status: 'queued',
                createdAt: record.createdAt
            })
        if (!options.defer && ['preparing', 'failed'].includes(record.status)) await this.enqueue(input, record)
        return record
    }

    async get(input: EvolutionChangeIdentity & { changeId: string }) {
        this.checkIdentity(input)
        return this.present(input, await this.records.read(this.db.manager, input, input.changeId))
    }
    async list(input: EvolutionChangeIdentity & { targetId?: string; requestId?: string }) {
        this.checkIdentity(input)
        return Promise.all((await this.records.list(input)).map((change) => this.present(input, change)))
    }

    async build(
        input: EvolutionChangeIdentity & { changeId: string; candidateInput: EvolutionChange['candidateInput'] }
    ) {
        this.checkIdentity(input)
        await this.db.transaction(async (manager) => {
            const change = await this.records.read(manager, input, input.changeId, true)
            this.strategies.current(change, input.organizationId)
            if (change.candidate && digest(change.candidateInput) !== digest(input.candidateInput))
                changeError('immutable_candidate_changed')
            if (!change.candidate) {
                change.candidateInput = input.candidateInput
                await this.save(manager, input, change)
            }
        })
        await this.process(input)
        return this.get(input)
    }

    async evaluate(input: EvolutionChangeIdentity & { changeId: string; datasetSnapshotIds?: Record<string, string> }) {
        this.checkIdentity(input)
        await this.db.transaction(async (manager) => {
            const change = await this.records.read(manager, input, input.changeId, true)
            this.strategies.current(change, input.organizationId)
            if (change.approval || change.receipt) changeError('approved_candidate_immutable')
            if (input.datasetSnapshotIds) {
                if (change.evaluation && digest(change.datasetSnapshotIds) !== digest(input.datasetSnapshotIds))
                    changeError('evaluation_snapshot_mismatch')
                change.datasetSnapshotIds = input.datasetSnapshotIds
            }
            if (!change.evaluation) {
                change.status = 'testing'
                await this.save(manager, input, change)
            }
        })
        await this.process(input)
        return this.get(input)
    }

    async process(input: EvolutionChangeIdentity & { changeId: string }) {
        const initial = await this.get(input)
        await this.store.updateJobStatus(input, initial.jobId, 'running', { startedAt: new Date().toISOString() })
        try {
            await this.db.transaction(async (manager) => {
                const change = await this.records.read(manager, input, input.changeId, true)
                if (!['preparing', 'testing', 'failed'].includes(change.status)) return
                const target = this.strategies.current(change, input.organizationId)
                const operation = this.operation(input, change, { actorId: change.createdBy, actorType: 'system' })
                if (!change.candidate) {
                    setStage(change, 'candidate', 'running')
                    const candidate = await this.buildDraft(operation, target)
                    if (digest(candidate.baseline) !== digest(change.baseline))
                        changeError('candidate_baseline_mismatch')
                    if (
                        !candidate.artifact.uri ||
                        !candidate.artifact.hash ||
                        candidate.artifact.schemaVersion !== target.descriptor.artifactSchemaVersion
                    )
                        changeError('invalid_candidate_artifact')
                    change.candidate = candidate
                    setStage(change, 'candidate', 'passed')
                }
                change.status = 'testing'
                await this.save(manager, input, change)
            })
            await this.db.transaction(async (manager) => {
                const change = await this.records.read(manager, input, input.changeId, true)
                if (!['preparing', 'testing', 'failed'].includes(change.status)) return
                const target = this.strategies.current(change, input.organizationId)
                if (
                    change.strategy.definition.evaluations.some(
                        (step) => step.kind === 'golden_replay' && !change.datasetSnapshotIds[step.key]
                    )
                )
                    return
                const operation = this.operation(input, change, { actorId: change.createdBy, actorType: 'system' })
                await this.assertCurrent(operation, target)
                const evaluation = change.evaluation ?? (await this.evaluations.run(operation, target, manager))
                change.failureReasons = []
                change.evaluation = evaluation
                change.status = evaluation.passed ? 'pending_approval' : 'test_failed'
                setStage(
                    change,
                    'evaluation',
                    evaluation.assessment === 'not_applicable'
                        ? 'not_applicable'
                        : evaluation.passed
                          ? 'passed'
                          : 'failed',
                    [evaluation.runId]
                )
                await this.save(manager, input, change)
                await this.audit(manager, input, change, 'candidate_assessed', operation.context.actor)
            })
            await this.store.updateJobStatus(input, initial.jobId, 'completed', {
                completedAt: new Date().toISOString()
            })
        } catch (error) {
            await this.db.transaction(async (manager) => {
                const change = await this.records.read(manager, input, input.changeId, true)
                if (['preparing', 'testing', 'failed'].includes(change.status)) {
                    change.status = 'failed'
                    change.failureReasons = [error instanceof Error ? error.message : 'change_preparation_failed']
                    setStage(change, change.candidate ? 'evaluation' : 'candidate', 'failed')
                    await this.save(manager, input, change)
                }
            })
            await this.store.updateJobStatus(input, initial.jobId, 'failed', {
                errorCode: 'change_preparation_failed',
                completedAt: new Date().toISOString()
            })
            throw error
        }
    }

    async decide(input: Parameters<EvolutionChangeRuntimeApi['decide']>[0]) {
        const actor = this.human(input)
        if (!['approved', 'rejected'].includes(input.decision) || !input.reason?.trim())
            changeError('review_reason_required')
        return this.db.transaction(async (manager) => {
            const change = await this.records.read(manager, input, input.changeId, true)
            const target = this.strategies.current(change, input.organizationId)
            if (
                !change.candidate ||
                !change.evaluation ||
                change.candidate.artifact.hash !== input.candidateHash ||
                change.evaluation.runId !== input.evaluationRunId ||
                change.evaluation.strategyHash !== change.strategy.hash
            )
                changeError('review_snapshot_mismatch')
            const prior = await manager
                .getRepository(ApprovalDecisionEntity)
                .find({
                    where: {
                        tenantId: input.tenantId,
                        organizationId: input.organizationId,
                        candidateId: change.changeId
                    }
                })
            const approvals = prior
                .map((row) => row.value)
                .filter(
                    (item) =>
                        item.candidateHash === input.candidateHash &&
                        item.evaluationRunId === input.evaluationRunId &&
                        item.strategyHash === change.strategy.hash
                )
            const sameActor = approvals.find((item) => item.actorId === actor.actorId)
            if (sameActor) {
                if (sameActor.decision !== input.decision) changeError('immutable_approval_changed')
                return change
            }
            if (!['pending_approval', 'test_failed'].includes(change.status)) changeError('not_reviewable')
            const operation = this.operation(input, change, actor)
            if (target.versionPublisher) await target.versionPublisher.authorizePublication(operation)
            if (input.decision === 'approved') {
                if (!change.evaluation.passed) changeError('tests_must_pass')
                await this.assertCurrent(operation, target)
            }
            const roleName = RequestContext.currentUser()?.role?.name
            const approval: ApprovalDecision = {
                approvalId: `APR-${randomUUID()}`,
                candidateId: change.changeId,
                candidateHash: input.candidateHash,
                evaluationRunId: input.evaluationRunId,
                strategyHash: change.strategy.hash,
                scope: change.scope,
                decision: input.decision,
                actorId: actor.actorId,
                actorRole: actor.actorRole ?? 'human_operator',
                actorRoleName: roleName,
                approvalAuthority:
                    roleName === RolesEnum.SUPER_ADMIN || roleName === RolesEnum.ADMIN ? 'administrator' : 'standard',
                reason: input.reason.trim(),
                decidedAt: new Date().toISOString()
            }
            change.approval = approval
            const gate = this.quality.reviewHumanApprovals(change.strategy.riskLevel, [...approvals, approval])
            change.status = input.decision === 'rejected' ? 'rejected' : gate.passed ? 'approved' : 'pending_approval'
            setStage(
                change,
                'approval',
                change.status === 'approved' ? 'passed' : change.status === 'rejected' ? 'failed' : 'pending'
            )
            await this.save(manager, input, change)
            await this.audit(manager, input, change, `candidate_${input.decision}`, actor)
            return change
        })
    }

    async publish(input: Parameters<EvolutionChangeRuntimeApi['publish']>[0]) {
        const actor = this.human(input)
        await this.db.transaction(async (manager) => {
            const change = await this.records.read(manager, input, input.changeId, true)
            if (change.receipt) return
            const target = this.strategies.current(change, input.organizationId)
            if (target.versionPublisher)
                await target.versionPublisher.authorizePublication(this.operation(input, change, actor))
            if (
                !['approved', 'publishing'].includes(change.status) ||
                change.approval?.decision !== 'approved' ||
                change.approval.strategyHash !== change.strategy.hash ||
                change.evaluation?.strategyHash !== change.strategy.hash ||
                !change.evaluation.passed
            )
                changeError('human_approval_required')
            change.status = 'publishing'
            setStage(change, 'publication', 'running')
            await this.save(manager, input, change)
        })
        return this.db.transaction(async (manager) => {
            const change = await this.records.read(manager, input, input.changeId, true)
            if (change.receipt) return change
            const target = this.strategies.current(change, input.organizationId)
            const operation = this.operation(input, change, actor)
            if (change.strategy.definition.publication.mode === 'staged_rollout') {
                await this.assertCurrent(operation, target)
                await this.publication.package(manager, operation)
            } else {
                await target.versionPublisher!.authorizePublication(operation)
                const receipt = await target.versionPublisher!.publish(operation)
                if (
                    receipt.changeId !== change.changeId ||
                    receipt.candidateHash !== change.candidate!.artifact.hash ||
                    receipt.approvalId !== change.approval!.approvalId
                )
                    changeError('write_receipt_mismatch')
                change.receipt = receipt
                change.status = 'published'
                setStage(change, 'publication', 'passed')
            }
            await this.save(manager, input, change)
            await this.audit(manager, input, change, 'version_publication', actor)
            return change
        })
    }

    private async buildDraft(operation: EvolutionChangeOperation, target: EvolutionTargetProvider) {
        if (operation.change.strategy.definition.candidate.builder === 'target_draft')
            return target.draftBuilder!.prepare(operation)
        const { change, context } = operation
        const baseline = await this.store.findVersion(context, change.baseline.resourceId)
        if (!baseline || baseline.value.artifact.hash !== change.baseline.hash)
            changeError('candidate_baseline_mismatch')
        const built = await target.candidateBuilder!.buildCandidate({
            context,
            targetId: change.targetId,
            scope: change.scope,
            proposalId: `PROP-${change.changeId}`,
            proposalRevision: 1,
            baseVersionId: change.baseline.resourceId,
            baseArtifact: baseline.value.artifact,
            changeSet: change.candidateInput,
            evidenceEventIds: change.learningEventIds,
            dependencyVersionIds: baseline.value.dependencyVersionIds,
            actorId: context.actor.actorId,
            idempotencyKey: `${change.changeId}:build`
        })
        const validation = await target.candidateBuilder!.validateCandidate({
            context,
            targetId: change.targetId,
            scope: change.scope,
            artifact: built.artifact,
            baseVersionId: change.baseline.resourceId,
            baseArtifact: baseline.value.artifact,
            dependencyVersionIds: built.dependencyVersionIds
        })
        if (!validation.valid) changeError('candidate_validation_failed')
        return {
            artifact: built.artifact,
            baseline: change.baseline,
            summary: built.validationSummary,
            warnings: built.warnings,
            changes: Object.entries(change.candidateInput).map(([path, value]) => ({
                path,
                operation: 'update',
                summary: path,
                after: JSON.stringify(value)
            }))
        }
    }

    private async assertCurrent(operation: EvolutionChangeOperation, target: EvolutionTargetProvider) {
        if (target.versionPublisher) {
            if (!(await target.versionPublisher.validateCurrent(operation)).valid)
                changeError('source_or_baseline_stale')
        } else {
            const pointer = await this.store.findPointer(
                operation.context,
                operation.change.targetId,
                operation.change.scope
            )
            const baseline = await this.store.findVersion(operation.context, operation.change.baseline.resourceId)
            if (
                !pointer ||
                pointer.activeVersionId !== operation.change.baseline.resourceId ||
                baseline?.value.artifact.hash !== operation.change.baseline.hash
            )
                changeError('source_or_baseline_stale')
        }
    }
    private async present(input: EvolutionChangeIdentity, change: EvolutionChange) {
        try {
            const target = this.providers.get(change.targetId, input.organizationId)
            const presentation = await target.presenter?.describe?.(
                this.operation(input, change, {
                    actorId: RequestContext.currentUserId() ?? 'system',
                    actorType: 'system'
                })
            )
            return presentation ? { ...change, presentation } : change
        } catch (error) {
            this.logger.warn({ code: 'evolution_presentation_unavailable', targetId: change.targetId })
            return { ...change, presentationUnavailable: true }
        }
    }
    private checkIdentity(input: EvolutionChangeIdentity) {
        if (
            !input.tenantId ||
            !input.organizationId ||
            input.tenantId !== RequestContext.currentTenantId() ||
            input.organizationId !== RequestContext.getOrganizationId()
        )
            changeError('identity_mismatch')
    }
    private human(input: EvolutionChangeIdentity): EvolutionActor {
        this.checkIdentity(input)
        if (!RequestContext.currentUserId() || !RequestContext.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE))
            changeError('human_publisher_required')
        return {
            actorId: RequestContext.currentUserId(),
            actorType: 'human',
            actorRole: RequestContext.currentRoleId()
        }
    }
    private operation(
        input: EvolutionChangeIdentity,
        change: EvolutionChange,
        actor: EvolutionActor
    ): EvolutionChangeOperation {
        return {
            change,
            context: {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                targetId: change.targetId,
                scope: change.scope,
                correlationId: change.changeId,
                actor
            }
        }
    }
    private save(manager: EntityManager, input: EvolutionChangeIdentity, change: EvolutionChange) {
        return this.records.save(manager, input, change, change.strategy)
    }
    private async enqueue(input: EvolutionChangeIdentity, change: EvolutionChange) {
        if (!this.queue) changeError('managed_queue_unavailable')
        await this.store.saveJob(input, {
            jobId: change.jobId,
            jobType: 'change_preparation',
            resourceId: change.changeId,
            status: 'queued',
            createdAt: change.createdAt
        })
        await this.queue.enqueue({
            ...CHANGE_QUEUE,
            ...input,
            userId: change.createdBy,
            jobId: change.jobId,
            payload: { changeId: change.changeId },
            attempts: 3,
            backoffMs: 1500
        })
    }
    private async audit(
        manager: EntityManager,
        input: EvolutionChangeIdentity,
        change: EvolutionChange,
        action: string,
        actor: EvolutionActor
    ) {
        const repository = manager.getRepository(EvolutionAuditEventEntity)
        const auditId = `AUD-${randomUUID()}`
        await repository.save(
            repository.create({
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                auditId,
                action,
                candidateId: change.changeId,
                value: {
                    auditId,
                    candidateId: change.changeId,
                    action,
                    actorId: actor.actorId,
                    actorRole: actor.actorRole ?? actor.actorType,
                    summary: `${change.strategy.definition.id}@${change.strategy.definition.version}: ${action}`,
                    occurredAt: new Date().toISOString()
                }
            })
        )
    }
}
export function digest(value: object) {
    return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
