import { pipelineRuntimeIntentSchema } from './pipeline-runtime-intent.schema'
import { pipelineDispatchEnabled } from './pipeline-dispatch-policy'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, Repository } from 'typeorm'
import {
    projectPipelineOperationReceiptSchema,
    projectPipelineCompletionReceiptSchema,
    projectPipelineConfigurationSchema,
    projectPipelineWorkContextSchema,
    projectPipelineResourceReservationSchema,
    type ProjectPipelineResourceReservation,
    type ProjectPipelineOperationReceipt,
    type ProjectPipelineCompletionReceipt
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext, ProjectPipelineOperationContext } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineDefinitionEntity
} from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { pipelineInputs } from './pipeline-inputs'
import { assertPipelineCommandAuthority } from './pipeline-transaction'
import { pipelineAdmissionBlock, pipelineAdmissionPolicy } from './pipeline-admission'
import { pipelineResourceResolverRef, pipelineResourcesBlock } from './pipeline-resources'
import { assertPipelineHostCompatible, pipelineRunHostCompatible } from '../configuration/pipeline-host-capabilities'

export interface PipelineOperationReservation {
    work: Omit<ProjectPipelineOperationContext['work'], 'operationId'>
    attempt: number
    kind: ProjectPipelineOperationEntity['kind']
    handlerRef: string
    completionRef: string | null
    inputs: ProjectPipelineOperationContext['inputs']
    parameters: ProjectPipelineOperationContext['parameters']
    subjects: ProjectPipelineOperationContext['subjects']
}
export interface PipelineOperationClaim {
    operation: ProjectPipelineOperationEntity
    mode: 'execute' | 'inspect' | 'evaluate' | 'cancel'
    fence: number
}
const terminal = new Set(['accepted', 'rejected', 'failed', 'cancelled', 'superseded'])
const runnable = ['queued', 'dispatching', 'pending', 'unknown', 'succeeded']

/** Internal store. Its caller authorizes commands; the worker reauthorizes each external call. */
@Injectable()
export class ProjectPipelineOperationStore implements OnModuleInit {
    constructor(
        @InjectRepository(ProjectPipelineOperationEntity)
        private readonly operations: Repository<ProjectPipelineOperationEntity>
    ) {}
    onModuleInit() {
        pipelineAdmissionPolicy()
    }

    /** Must share the caller's transaction with Task/Node reservation. No external callbacks here. */
    async reserve(manager: EntityManager, context: ProjectPipelineContext, input: PipelineOperationReservation) {
        if (!manager.queryRunner?.isTransactionActive) throw new Error('PIPELINE_RESERVATION_REQUIRES_TRANSACTION')
        if (!Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt > 20)
            throw pipelineProjectionConflict('ATTEMPT_LIMIT_INVALID')
        await this.lockProject(manager, context)
        await this.assertCurrent(manager, context, input.work)
        const id = pipelineIdentity(context, 'operation', input.work.nodeInstanceId, String(input.attempt))
        projectPipelineWorkContextSchema.parse({ ...input.work, operationId: id })
        const snapshot: ProjectPipelineOperationContext = {
            ...context,
            work: { ...input.work, operationId: id },
            idempotencyKey: id,
            inputs: input.inputs,
            parameters: input.parameters,
            subjects: input.subjects
        }
        const snapshotDigest = pipelineDigest({
            snapshot: { ...snapshot, actor: { ...snapshot.actor }, work: { ...snapshot.work } },
            handlerRef: input.handlerRef,
            kind: input.kind,
            completionRef: input.completionRef
        })
        const existing = await manager.findOneBy(ProjectPipelineOperationEntity, { ...projectionScope(context), id })
        if (existing) {
            if (existing.snapshotDigest !== snapshotDigest)
                throw pipelineProjectionConflict('OPERATION_INPUT_IMMUTABLE')
            return existing
        }
        await this.validateReservation(manager, context, input)
        return manager.save(
            ProjectPipelineOperationEntity,
            manager.create(ProjectPipelineOperationEntity, {
                id,
                ...this.audit(context),
                instanceId: input.work.instanceId,
                runId: input.work.runId,
                roundId: input.work.roundId,
                nodeInstanceId: input.work.nodeInstanceId,
                attempt: input.attempt,
                kind: input.kind,
                handlerRef: input.handlerRef,
                completionRef: input.completionRef,
                snapshotDigest,
                context: snapshot,
                state: 'queued',
                receipt: null,
                completion: null,
                resourceReservation: null,
                leaseOwner: null,
                leaseFence: 0,
                leaseExpiresAt: null,
                nextCheckAt: await this.now(manager)
            })
        )
    }

    /** Resolver runs outside transactions. It may inspect resources but must not allocate or write. */
    async resourcePreparation(context: ProjectPipelineContext, id: string) {
        const operation = await this.find(this.operations.manager, context, id)
        if (
            !pipelineDispatchEnabled() ||
            operation.state !== 'queued' ||
            operation.cancelRequestedAt ||
            operation.resourceReservation ||
            !(await this.isCurrent(this.operations.manager, context, operation.context.work))
        )
            return null
        if (!(await pipelineRunHostCompatible(this.operations.manager, context, operation.runId))) return null
        const resolverRef = await pipelineResourceResolverRef(this.operations.manager, context, operation)
        return resolverRef ? { resolverRef, context: operation.context } : null
    }

    async prepareResources(context: ProjectPipelineContext, id: string, value: ProjectPipelineResourceReservation) {
        const reservation = projectPipelineResourceReservationSchema.parse(value)
        return this.operations.manager.transaction(async (manager) => {
            await this.lockProject(manager, context)
            const operation = await this.find(manager, context, id)
            if (operation.resourceReservation) {
                if (pipelineDigest(operation.resourceReservation) !== pipelineDigest(reservation))
                    throw pipelineProjectionConflict('RESOURCE_RESERVATION_IMMUTABLE')
                return
            }
            if (operation.state !== 'queued' || operation.leaseFence !== 0 || operation.cancelRequestedAt)
                throw pipelineProjectionConflict('RESOURCE_RESERVATION_TOO_LATE')
            await this.assertCurrent(manager, context, operation.context.work)
            if ((await pipelineResourceResolverRef(manager, context, operation)) !== reservation.resolverRef)
                throw pipelineProjectionConflict('RESOURCE_RESOLVER_CHANGED')
            operation.resourceReservation = reservation
            await manager.save(operation)
        })
    }

    async claim(
        context: ProjectPipelineContext,
        id: string,
        workerId: string,
        leaseMs = 30_000
    ): Promise<PipelineOperationClaim | null> {
        if (!Number.isInteger(leaseMs) || leaseMs < 100 || leaseMs > 120_000) throw new Error('PIPELINE_LEASE_INVALID')
        return this.operations.manager.transaction(async (manager) => {
            await this.lockProject(manager, context)
            const operation = await this.find(manager, context, id)
            const now = await this.now(manager)
            if (
                terminal.has(operation.state) ||
                operation.nextCheckAt > now ||
                (operation.leaseExpiresAt && operation.leaseExpiresAt > now)
            )
                return null
            if (!(await pipelineRunHostCompatible(manager, context, operation.runId))) {
                // Leave execute/inspect rights intact for a compatible worker; avoid starving the outbox page.
                operation.nextCheckAt = new Date(now.getTime() + 60_000)
                await manager.save(operation)
                return null
            }
            const current = await this.isCurrent(manager, context, operation.context.work)
            if (!current && operation.state === 'queued') {
                operation.state = 'superseded'
                operation.leaseOwner = null
                operation.leaseExpiresAt = null
                await manager.save(operation)
                return null
            }
            const mode =
                operation.cancelRequestedAt && !operation.cancelDispatchedAt
                    ? 'cancel'
                    : operation.state === 'queued'
                      ? 'execute'
                      : current && operation.state === 'succeeded'
                        ? 'evaluate'
                        : 'inspect'
            if (mode === 'execute' && !pipelineDispatchEnabled()) return null
            if (
                mode === 'execute' &&
                ((await pipelineAdmissionBlock(manager, context, operation)) ||
                    (await pipelineResourcesBlock(manager, context, operation)))
            ) {
                operation.nextCheckAt = new Date(now.getTime() + 5_000)
                await manager.save(operation)
                return null
            }
            // Once claimed, loss of the worker can never produce a second execute for this operation.
            if (mode === 'execute') operation.state = 'dispatching'
            // Recovery owns observation only; even a fresh fence cannot authorize another dispatch.
            else if (mode === 'inspect' && operation.state === 'dispatching') operation.state = 'unknown'
            operation.leaseFence += 1
            operation.leaseOwner = workerId
            operation.leaseExpiresAt = new Date(now.getTime() + leaseMs)
            await manager.save(operation)
            return { operation, mode, fence: operation.leaseFence }
        })
    }

    async beginCancel(context: ProjectPipelineContext, id: string, workerId: string, fence: number) {
        return this.operations.manager.transaction(async (manager) => {
            await this.lockProject(manager, context)
            const operation = await this.find(manager, context, id),
                now = await this.now(manager)
            if (
                !operation.cancelRequestedAt ||
                operation.cancelDispatchedAt ||
                terminal.has(operation.state) ||
                operation.leaseOwner !== workerId ||
                operation.leaseFence !== fence ||
                !operation.leaseExpiresAt ||
                operation.leaseExpiresAt <= now
            )
                return false
            if (!(await pipelineRunHostCompatible(manager, context, operation.runId))) return false
            operation.cancelDispatchedAt = now
            await manager.save(operation)
            return true
        })
    }

    /** Last database fence before the first external effect; queued time is never reported as execution time. */
    async beginDispatch(context: ProjectPipelineContext, id: string, workerId: string, fence: number) {
        return this.operations.manager.transaction(async (manager) => {
            await this.lockProject(manager, context)
            const operation = await this.find(manager, context, id),
                now = await this.now(manager)
            if (
                !pipelineDispatchEnabled() ||
                operation.state !== 'dispatching' ||
                operation.dispatchStartedAt ||
                operation.leaseOwner !== workerId ||
                operation.leaseFence !== fence ||
                !operation.leaseExpiresAt ||
                operation.leaseExpiresAt <= now ||
                !(await this.isCurrent(manager, context, operation.context.work))
            )
                return false
            if (!(await pipelineRunHostCompatible(manager, context, operation.runId))) return false
            operation.dispatchStartedAt = now
            await manager.save(operation)
            return true
        })
    }

    /** The callback updates the associated Task, Node and successor outbox in this same transaction. */
    async settle(
        context: ProjectPipelineContext,
        id: string,
        workerId: string,
        fence: number,
        input: { receipt: ProjectPipelineOperationReceipt; completion?: ProjectPipelineCompletionReceipt },
        apply: (manager: EntityManager, operation: ProjectPipelineOperationEntity) => Promise<void>,
        applyHistorical?: (manager: EntityManager, operation: ProjectPipelineOperationEntity) => Promise<void>
    ) {
        const receipt = projectPipelineOperationReceiptSchema.parse(input.receipt)
        const completion = input.completion ? projectPipelineCompletionReceiptSchema.parse(input.completion) : null
        if (completion && receipt.status !== 'succeeded')
            throw pipelineProjectionConflict('COMPLETION_REQUIRES_SUCCESSFUL_RECEIPT')
        return this.operations.manager.transaction(async (manager) => {
            await this.lockProject(manager, context)
            const operation = await this.find(manager, context, id)
            const now = await this.now(manager)
            if (
                operation.leaseOwner !== workerId ||
                operation.leaseFence !== fence ||
                !operation.leaseExpiresAt ||
                operation.leaseExpiresAt <= now ||
                terminal.has(operation.state)
            )
                return { status: 'stale' as const }
            if (receipt.execution?.kind === 'assistant_task') {
                const intent = operation.assistantIntent
                if (
                    !intent ||
                    receipt.execution.executionId !== intent.executionId ||
                    receipt.execution.conversationId !== intent.conversationId ||
                    receipt.execution.xpertId !== intent.xpertId ||
                    receipt.execution.publishedVersion !== intent.publishedVersion
                )
                    throw pipelineProjectionConflict('EXECUTOR_RECEIPT_IDENTITY_CHANGED')
            }
            if (receipt.execution?.kind === 'runtime_invocation') {
                const intent = operation.runtimeIntent
                if (
                    !intent ||
                    receipt.execution.invocationId !== intent.invocationId ||
                    receipt.execution.bindingId !== intent.target.bindingId ||
                    receipt.execution.provider !== intent.target.provider ||
                    receipt.execution.revision !== intent.target.revision
                )
                    throw pipelineProjectionConflict('EXECUTOR_RECEIPT_IDENTITY_CHANGED')
            }
            if (
                operation.receipt?.receiptKey &&
                receipt.receiptKey &&
                operation.receipt.receiptKey !== receipt.receiptKey
            )
                throw pipelineProjectionConflict('OPERATION_RECEIPT_IDENTITY_CHANGED')
            if (receipt.status === 'unknown' && !receipt.receiptKey && operation.receipt?.receiptKey)
                receipt.receiptKey = operation.receipt.receiptKey
            if (
                operation.receipt?.status === 'succeeded' &&
                pipelineDigest(operation.receipt) !== pipelineDigest(receipt)
            )
                throw pipelineProjectionConflict('OPERATION_OUTPUT_IMMUTABLE')
            operation.receipt = receipt
            if (
                receipt.status === 'succeeded' ||
                receipt.status === 'failed' ||
                receipt.status === 'cancelled' ||
                receipt.execution?.status === 'succeeded' ||
                receipt.execution?.status === 'failed' ||
                receipt.execution?.status === 'cancelled'
            )
                operation.terminalObservedAt ??= now
            operation.completion = completion
            operation.leaseOwner = null
            operation.leaseExpiresAt = null
            operation.nextCheckAt = new Date(now.getTime() + 5_000)
            if (!(await this.isCurrent(manager, context, operation.context.work))) {
                // Supersession invalidates business acceptance, not the existence of a still-running effect.
                operation.state =
                    !operation.terminalObservedAt && (receipt.status === 'pending' || receipt.status === 'unknown')
                        ? receipt.status
                        : 'superseded'
                await manager.save(operation)
                if (applyHistorical) await applyHistorical(manager, operation)
                return { status: 'superseded' as const }
            }
            operation.state =
                completion?.status === 'accepted'
                    ? 'accepted'
                    : completion?.status === 'rejected'
                      ? 'rejected'
                      : receipt.status
            await manager.save(operation)
            await apply(manager, operation)
            return { status: 'applied' as const }
        })
    }

    /** Bounded recovery scan. Scheduling these IDs grants no authority; claim and the worker revalidate scope. */
    due(limit = 100, afterId?: string) {
        const query = this.operations
            .createQueryBuilder('operation')
            .where('operation.state IN (:...states)', {
                states: pipelineDispatchEnabled() ? runnable : runnable.filter((state) => state !== 'queued')
            })
            .andWhere('operation."nextCheckAt" <= CURRENT_TIMESTAMP')
            .andWhere('(operation."leaseExpiresAt" IS NULL OR operation."leaseExpiresAt" <= CURRENT_TIMESTAMP)')
            .orderBy('operation.id', 'ASC')
            .take(Math.min(500, Math.max(1, limit)))
        if (afterId) query.andWhere('operation.id > :afterId', { afterId })
        return query.getMany()
    }

    private async lockProject(manager: EntityManager, context: ProjectPipelineContext) {
        assertPipelineCommandAuthority()
        await manager.query("SET LOCAL lock_timeout = '2s'")
        await manager.query("SET LOCAL statement_timeout = '10s'")
        const scope = projectionScope(context)
        await manager.findOneOrFail(XpertProject, {
            where: { id: context.projectId, tenantId: context.actor.tenantId, organizationId: scope.organizationId },
            lock: { mode: 'pessimistic_write' }
        })
    }
    private async validateReservation(
        manager: EntityManager,
        context: ProjectPipelineContext,
        input: PipelineOperationReservation
    ) {
        const scope = projectionScope(context)
        const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, {
            ...scope,
            id: input.work.nodeInstanceId
        })
        const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: input.work.runId })
        const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, { ...scope, id: input.work.roundId })
        const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
            ...scope,
            id: run.definitionId
        })
        const configuration = projectPipelineConfigurationSchema.parse({
            schemaVersion: 1,
            template: definition.definition,
            binding: run.bindingSnapshot
        })
        assertPipelineHostCompatible(configuration.template, configuration.binding)
        if (configuration.template.executionAuthority !== 'platform')
            throw pipelineProjectionConflict('PIPELINE_AUTHORITY_MISMATCH')
        const spec = configuration.template.nodes.find((item) => item.key === node.nodeKey)
        const expected =
            spec?.kind === 'work'
                ? { kind: 'operation', handler: spec.operationRef, completion: spec.completionRef }
                : spec?.kind === 'router'
                  ? { kind: 'policy', handler: spec.policyRef, completion: null }
                  : spec?.kind === 'external_wait'
                    ? { kind: 'subscription', handler: spec.subscriptionRef, completion: null }
                    : null
        if (
            !expected ||
            input.kind !== expected.kind ||
            input.handlerRef !== expected.handler ||
            input.completionRef !== expected.completion
        )
            throw pipelineProjectionConflict('OPERATION_NOT_IN_DEFINITION')
        if (
            node.projection.state.lifecycle !== 'pending' ||
            node.projection.state.readiness !== 'ready' ||
            node.projection.state.applicability !== 'selected' ||
            node.projection.state.runtime !== 'none'
        )
            throw pipelineProjectionConflict('NODE_NOT_READY')
        const limits = configuration.binding.limits!
        if (input.attempt > limits.maxTechnicalAttemptsPerNode)
            throw pipelineProjectionConflict('ATTEMPT_LIMIT_EXCEEDED')
        if ((await this.now(manager)).getTime() - run.createdAt.getTime() >= limits.runTimeoutMinutes * 60_000)
            throw pipelineProjectionConflict('RUN_TIME_LIMIT_EXCEEDED')
        if (
            input.kind === 'operation' &&
            (await manager.count(ProjectPipelineOperationEntity, {
                where: {
                    ...scope,
                    instanceId: input.work.instanceId,
                    kind: 'operation',
                    state: In(['queued', 'dispatching', 'pending', 'unknown'])
                }
            })) >= limits.maxConcurrentExecutions
        )
            throw pipelineProjectionConflict('RUN_CONCURRENCY_EXCEEDED')
        if (
            pipelineDigest(input.subjects) !== pipelineDigest(round.subjectVersionSet) ||
            pipelineDigest(input.parameters) !== pipelineDigest(configuration.binding.parameters)
        )
            throw pipelineProjectionConflict('OPERATION_INPUT_IMMUTABLE')
        const expectedInputs = await pipelineInputs(manager, context, round, spec!, configuration.binding)
        if (pipelineDigest(input.inputs) !== pipelineDigest(expectedInputs))
            throw pipelineProjectionConflict('OPERATION_INPUT_BINDING_MISMATCH')
    }
    private async find(manager: EntityManager, context: ProjectPipelineContext, id: string) {
        const operation = await manager
            .getRepository(ProjectPipelineOperationEntity)
            .createQueryBuilder('operation')
            .addSelect(['operation.assistantIntent', 'operation.runtimeIntent'])
            .where({ ...projectionScope(context), id })
            .getOneOrFail()
        if (operation.context.actor.userId !== context.actor.userId)
            throw pipelineProjectionConflict('OPERATION_ACTOR_MISMATCH')
        if (operation.runtimeIntent)
            operation.runtimeIntent = pipelineRuntimeIntentSchema.parse(operation.runtimeIntent)
        if (operation.resourceReservation)
            operation.resourceReservation = projectPipelineResourceReservationSchema.parse(
                operation.resourceReservation
            )
        return operation
    }
    private async assertCurrent(
        manager: EntityManager,
        context: ProjectPipelineContext,
        work: PipelineOperationReservation['work']
    ) {
        if (!(await this.isCurrent(manager, context, work)))
            throw pipelineProjectionConflict('OPERATION_GENERATION_SUPERSEDED')
    }
    private async isCurrent(
        manager: EntityManager,
        context: ProjectPipelineContext,
        work: PipelineOperationReservation['work']
    ) {
        const scope = projectionScope(context)
        const instance = await manager.findOneBy(ProjectPipelineInstanceEntity, { ...scope, id: work.instanceId })
        const run = await manager.findOneBy(ProjectPipelineRunEntity, {
            ...scope,
            id: work.runId,
            instanceId: work.instanceId
        })
        const round = await manager.findOneBy(ProjectPipelineRoundEntity, {
            ...scope,
            id: work.roundId,
            runId: work.runId
        })
        const node = await manager.findOneBy(ProjectPipelineNodeEntity, {
            ...scope,
            id: work.nodeInstanceId,
            roundId: work.roundId
        })
        return !!(
            instance?.authority === 'platform' &&
            instance.currentRunId === work.runId &&
            instance.currentRoundId === work.roundId &&
            run &&
            ['pending', 'active', 'waiting'].includes(run.state) &&
            round?.state === 'active' &&
            round.generation === work.generation &&
            round.inputDigest === work.inputDigest &&
            node?.disposition === 'active' &&
            node.projection.state.freshness === 'current'
        )
    }
    private audit(context: ProjectPipelineContext) {
        return {
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId ?? null,
            projectId: context.projectId,
            createdById: context.actor.userId
        }
    }
    private async now(manager: EntityManager): Promise<Date> {
        const rows: Array<{ now: Date }> = await manager.query('SELECT clock_timestamp() AS now')
        return rows[0].now
    }
}
