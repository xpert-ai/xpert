import { pipelineDispatchEnabled, assertPipelineDispatchEnabled } from '../runtime/pipeline-dispatch-policy'
// The first claim consumes execute exactly once. Lease recovery only inspects that
// operation; a provider receipt and its outstanding projection commit together.
import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, Repository } from 'typeorm'
import {
    projectPipelineDefinitionSchema,
    projectPipelineProjectionNodeSchema,
    projectPipelineProviderActionCommandSchema,
    projectPipelineProviderActionReceiptSchema,
    type ProjectPipelineProviderActionCommand,
    type ProjectPipelineProviderActionReceipt,
    type ProjectPipelineProviderActionView
} from '@xpert-ai/contracts'
import type {
    ProjectPipelineContext,
    ProjectPipelineProviderNodeContext,
    ProjectPipelineProviderActionContext
} from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineProviderActionEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineDefinitionEntity
} from '../persistence/pipeline.entity'
import { lockManagedProject, managedAudit } from '../runtime/pipeline-transaction'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { assertPipelineHostCompatible, pipelineRunHostCompatible } from '../configuration/pipeline-host-capabilities'

const active = ['queued', 'dispatching', 'pending', 'unknown']
export type ProviderActionClaim = {
    row: ProjectPipelineProviderActionEntity
    mode: 'execute' | 'inspect' | 'project'
    fence: number
}

@Injectable()
export class ProjectPipelineProviderActionStore {
    constructor(
        @InjectRepository(ProjectPipelineProviderActionEntity)
        private readonly rows: Repository<ProjectPipelineProviderActionEntity>
    ) {}

    async target(
        context: ProjectPipelineContext,
        input: { instanceId: string; nodeInstanceId: string },
        manager = this.rows.manager
    ) {
        const scope = projectionScope(context)
        const instance = await manager.findOneBy(ProjectPipelineInstanceEntity, { ...scope, id: input.instanceId })
        const round =
            instance?.currentRoundId &&
            (await manager.findOneBy(ProjectPipelineRoundEntity, { ...scope, id: instance.currentRoundId }))
        const run =
            round &&
            (await manager.findOneBy(ProjectPipelineRunEntity, { ...scope, id: round.runId, instanceId: instance.id }))
        const node =
            round &&
            (await manager.findOneBy(ProjectPipelineNodeEntity, {
                ...scope,
                id: input.nodeInstanceId,
                roundId: round.id,
                disposition: 'active'
            }))
        if (instance?.authority !== 'provider' || !round || !run || !node || instance.currentRunId !== run.id)
            throw pipelineProjectionConflict('PROVIDER_ACTION_TARGET_UNAVAILABLE')
        const saved = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, { ...scope, id: run.definitionId })
        const definition = projectPipelineDefinitionSchema.parse(saved.definition)
        if (definition.executionAuthority !== 'provider' || definition.providerRef !== instance.ownerRef)
            throw pipelineProjectionConflict('PROVIDER_ACTION_AUTHORITY_MISMATCH')
        const projection = projectPipelineProjectionNodeSchema.parse(node.projection)
        const target = {
            instanceId: instance.id,
            nodeInstanceId: node.id,
            roundId: round.id,
            expectedRevision: instance.revision,
            generation: round.generation,
            inputDigest: round.inputDigest
        }
        const provider: ProjectPipelineProviderNodeContext = {
            ...context,
            sourceKey: instance.sourceKey,
            work: {
                instanceId: instance.id,
                runId: run.id,
                roundId: round.id,
                nodeInstanceId: node.id,
                inputDigest: round.inputDigest,
                generation: round.generation
            },
            node: projection
        }
        return { instance, run, round, node, definition, target, provider }
    }

    async list(context: ProjectPipelineContext, input: { instanceId: string; nodeInstanceId: string }) {
        return this.rows.find({
            where: { ...projectionScope(context), instanceId: input.instanceId, nodeInstanceId: input.nodeInstanceId },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: 50
        })
    }

    async replay(context: ProjectPipelineContext, input: ProjectPipelineProviderActionCommand) {
        const id = pipelineIdentity(context, 'provider-action', input.requestId)
        const row = await this.rows.findOneBy({ ...projectionScope(context), id })
        if (row && (row.createdById !== context.actor.userId || row.digest !== pipelineDigest(input)))
            throw pipelineProjectionConflict('PROVIDER_ACTION_REQUEST_CONFLICT')
        return row
    }

    async reserve(context: ProjectPipelineContext, input: ProjectPipelineProviderActionCommand) {
        return this.rows.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const id = pipelineIdentity(context, 'provider-action', input.requestId)
            const existing = await manager.findOneBy(ProjectPipelineProviderActionEntity, {
                ...projectionScope(context),
                id
            })
            if (existing) {
                if (existing.createdById !== context.actor.userId || existing.digest !== pipelineDigest(input))
                    throw pipelineProjectionConflict('PROVIDER_ACTION_REQUEST_CONFLICT')
                return existing
            }
            assertPipelineDispatchEnabled()
            const saved = await this.target(
                context,
                { instanceId: input.instanceId, nodeInstanceId: input.nodeInstanceId },
                manager
            )
            assertPipelineHostCompatible(saved.definition)
            if (!this.matches(saved, input) || !saved.definition.actionRefs?.includes(input.actionRef))
                throw pipelineProjectionConflict('PROVIDER_ACTION_VERSION_CONFLICT')
            if (
                await manager.count(ProjectPipelineProviderActionEntity, {
                    where: { ...projectionScope(context), nodeInstanceId: input.nodeInstanceId, state: In(active) }
                })
            )
                throw pipelineProjectionConflict('PROVIDER_ACTION_CONFIRMATION_PENDING')
            return manager.save(
                ProjectPipelineProviderActionEntity,
                manager.create(ProjectPipelineProviderActionEntity, {
                    id,
                    ...managedAudit(context),
                    instanceId: input.instanceId,
                    runId: saved.run.id,
                    roundId: input.roundId,
                    nodeInstanceId: input.nodeInstanceId,
                    providerRef: saved.instance.ownerRef,
                    sourceKey: saved.instance.sourceKey,
                    input,
                    node: saved.provider.node,
                    digest: pipelineDigest(input),
                    state: 'queued',
                    receipt: null,
                    reasonCode: null,
                    leaseOwner: null,
                    leaseFence: 0,
                    leaseExpiresAt: null,
                    dispatchStartedAt: null,
                    nextCheckAt: await this.now(manager),
                    projectionPending: false
                })
            )
        })
    }

    async claim(
        context: ProjectPipelineContext,
        id: string,
        worker: string,
        leaseMs = 120_000
    ): Promise<ProviderActionClaim | null> {
        if (!Number.isInteger(leaseMs) || leaseMs < 100 || leaseMs > 120_000) throw new Error('PIPELINE_LEASE_INVALID')
        return this.rows.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const row = await this.find(manager, context, id),
                now = await this.now(manager)
            if (
                (!active.includes(row.state) && !row.projectionPending) ||
                row.nextCheckAt > now ||
                (row.leaseExpiresAt && row.leaseExpiresAt > now)
            )
                return null
            if (!(await pipelineRunHostCompatible(manager, context, row.runId))) {
                row.nextCheckAt = new Date(now.getTime() + 60_000)
                await manager.save(row)
                return null
            }
            if (row.state === 'queued' && !(await this.current(manager, context, row))) {
                row.state = 'superseded'
                row.reasonCode = 'PROVIDER_ACTION_VERSION_CONFLICT'
                await manager.save(row)
                return null
            }
            const mode = row.state === 'queued' ? 'execute' : row.projectionPending ? 'project' : 'inspect'
            if (mode === 'execute' && !pipelineDispatchEnabled()) return null
            if (mode === 'execute') row.state = 'dispatching'
            // Recovery owns observation only; even a fresh fence cannot authorize another dispatch.
            else if (mode === 'inspect' && row.state === 'dispatching') row.state = 'unknown'
            row.leaseOwner = worker
            row.leaseFence++
            row.leaseExpiresAt = new Date(now.getTime() + leaseMs)
            await manager.save(row)
            return { row, mode, fence: row.leaseFence }
        })
    }

    async begin(context: ProjectPipelineContext, id: string, worker: string, fence: number) {
        return this.rows.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const row = await this.find(manager, context, id),
                now = await this.now(manager)
            if (
                !pipelineDispatchEnabled() ||
                !this.owns(row, worker, fence, now) ||
                row.state !== 'dispatching' ||
                row.dispatchStartedAt
            )
                return false
            if (!(await pipelineRunHostCompatible(manager, context, row.runId))) return false
            if (!(await this.current(manager, context, row))) {
                row.state = 'superseded'
                row.reasonCode = 'PROVIDER_ACTION_VERSION_CONFLICT'
                row.leaseOwner = null
                row.leaseExpiresAt = null
                await manager.save(row)
                return false
            }
            row.dispatchStartedAt = now
            await manager.save(row)
            return true
        })
    }

    async settle(
        context: ProjectPipelineContext,
        id: string,
        worker: string,
        fence: number,
        observation: ProjectPipelineProviderActionReceipt
    ) {
        const receipt = projectPipelineProviderActionReceiptSchema.parse(observation)
        return this.rows.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const row = await this.find(manager, context, id),
                now = await this.now(manager)
            if (!this.owns(row, worker, fence, now) || !active.includes(row.state)) return false
            if (row.receipt?.receiptKey && receipt.receiptKey && row.receipt.receiptKey !== receipt.receiptKey)
                throw pipelineProjectionConflict('PROVIDER_ACTION_RECEIPT_CHANGED')
            receipt.receiptKey ??= row.receipt?.receiptKey
            row.projectionPending ||= pipelineDigest(row.receipt) !== pipelineDigest(receipt)
            row.receipt = receipt
            row.state = receipt.status
            row.reasonCode = receipt.reasonCode ?? null
            row.leaseOwner = null
            row.leaseExpiresAt = null
            row.nextCheckAt = new Date(now.getTime() + (receipt.status === 'unknown' ? 30_000 : 5_000))
            await manager.save(row)
            return true
        })
    }

    async projected(context: ProjectPipelineContext, id: string, worker: string, fence: number) {
        return this.rows.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const row = await this.find(manager, context, id),
                now = await this.now(manager)
            if (!this.owns(row, worker, fence, now)) return false
            row.projectionPending = false
            row.leaseOwner = null
            row.leaseExpiresAt = null
            row.nextCheckAt = new Date(now.getTime() + 5000)
            await manager.save(row)
            return true
        })
    }

    due(afterId?: string) {
        const query = this.rows
            .createQueryBuilder('action')
            .where('(action.state IN (:...active) OR action."projectionPending")', {
                active: pipelineDispatchEnabled() ? active : active.filter((state) => state !== 'queued')
            })
            .andWhere(
                'action."nextCheckAt" <= CURRENT_TIMESTAMP AND (action."leaseExpiresAt" IS NULL OR action."leaseExpiresAt" <= CURRENT_TIMESTAMP)'
            )
        if (afterId) query.andWhere('action.id > :afterId', { afterId })
        return query.orderBy('action.id', 'ASC').take(40).getMany()
    }
    private async find(manager: EntityManager, context: ProjectPipelineContext, id: string) {
        const row = await manager.findOneByOrFail(ProjectPipelineProviderActionEntity, {
            ...projectionScope(context),
            id
        })
        if (row.createdById !== context.actor.userId) throw pipelineProjectionConflict('PROVIDER_ACTION_ACTOR_MISMATCH')
        row.input = projectPipelineProviderActionCommandSchema.parse(row.input)
        row.node = projectPipelineProjectionNodeSchema.parse(row.node)
        if (row.receipt) row.receipt = projectPipelineProviderActionReceiptSchema.parse(row.receipt)
        return row
    }
    private async current(
        manager: EntityManager,
        context: ProjectPipelineContext,
        row: ProjectPipelineProviderActionEntity
    ) {
        try {
            return this.matches(
                await this.target(context, { instanceId: row.instanceId, nodeInstanceId: row.nodeInstanceId }, manager),
                row.input
            )
        } catch (error) {
            if (error instanceof ConflictException) return false
            throw error
        }
    }
    private matches(
        saved: Awaited<ReturnType<ProjectPipelineProviderActionStore['target']>>,
        input: ProjectPipelineProviderActionCommand
    ) {
        return (
            Object.entries(saved.target).every(([key, value]) => input[key as keyof typeof saved.target] === value) &&
            saved.node.projection.state.freshness === 'current' &&
            saved.node.projection.state.applicability === 'selected' &&
            saved.round.state === 'active' &&
            ['active', 'waiting', 'pending'].includes(saved.run.state)
        )
    }
    private owns(row: ProjectPipelineProviderActionEntity, worker: string, fence: number, now: Date) {
        return row.leaseOwner === worker && row.leaseFence === fence && !!row.leaseExpiresAt && row.leaseExpiresAt > now
    }
    private async now(manager: EntityManager): Promise<Date> {
        const rows: Array<{ now: Date }> = await manager.query('SELECT clock_timestamp() AS now')
        return rows[0].now
    }
}

// Keep only public, non-sensitive receipt fields in the browser view.
export function providerActionView(row: ProjectPipelineProviderActionEntity): ProjectPipelineProviderActionView {
    const input = projectPipelineProviderActionCommandSchema.parse(row.input)
    return {
        id: row.id,
        nodeInstanceId: row.nodeInstanceId,
        actionRef: input.actionRef,
        state: row.state,
        reasonCode: row.reasonCode,
        projectionPending: row.projectionPending,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
    }
}
export function providerActionContext(
    context: ProjectPipelineContext,
    row: ProjectPipelineProviderActionEntity
): ProjectPipelineProviderActionContext {
    return {
        ...context,
        sourceKey: row.sourceKey,
        node: row.node,
        work: {
            instanceId: row.instanceId,
            runId: row.runId,
            roundId: row.roundId,
            nodeInstanceId: row.nodeInstanceId,
            inputDigest: row.input.inputDigest,
            generation: row.input.generation
        },
        operationId: row.id,
        actionRef: row.input.actionRef,
        sourceRevision: row.input.sourceRevision,
        parameters: row.input.parameters
    }
}
