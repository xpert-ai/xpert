import { PaginationParams, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { assign, omit } from 'lodash'
import { DeepPartial, FindManyOptions, In, IsNull, Repository } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecution } from './agent-execution.entity'
import { accumulateActualExecutionUsage, type TExecutionUsageRecord } from './types'
import { executionCompletedAt } from './execution-timing'

import { postedPointsByExecutionSql } from '../membership/posted-model-points'

@Injectable()
export class XpertAgentExecutionService extends TenantOrganizationAwareCrudService<XpertAgentExecution> {
    constructor(
        @InjectRepository(XpertAgentExecution)
        repository: Repository<XpertAgentExecution>
    ) {
        super(repository)
    }

    async create(entity: DeepPartial<XpertAgentExecution>, ...options: unknown[]): Promise<XpertAgentExecution> {
        // Audit timestamps belong to the ORM, not caller snapshots.
        const changes: DeepPartial<XpertAgentExecution> = omit(entity, ['createdAt', 'updatedAt'])
        return super.create({ ...changes, completedAt: executionCompletedAt(undefined, entity.status) }, ...options)
    }

    async update(id: string, entity: Partial<XpertAgentExecution>): Promise<XpertAgentExecution> {
        const changes: Partial<XpertAgentExecution> = omit(entity, ['createdAt', 'updatedAt'])
        const scope = await super.findOne(id)
        // Serialize lifecycle and metadata saves so an older read cannot erase a concurrent end.
        return this.repository.manager.transaction(async (manager) => {
            const current = await manager.findOne(XpertAgentExecution, {
                where: { id, tenantId: scope.tenantId, organizationId: scope.organizationId ?? IsNull() },
                lock: { mode: 'pessimistic_write' }
            })
            if (!current) throw new NotFoundException()
            const completedAt = executionCompletedAt(current, changes.status)
            // Finalizers hold an older execution object. Only the checkpoint transaction
            // may advance durable recovery references; metadata updates must preserve them.
            if (current.metadata?.recovery) {
                delete changes.checkpointId
                delete changes.checkpointNs
                if (changes.metadata)
                    changes.metadata = { ...current.metadata, ...changes.metadata, recovery: current.metadata.recovery }
                else delete changes.metadata
            }
            // Lifecycle snapshots may predate durable usage callbacks. Only a snapshot
            // carrying at least the current usage can replace the accumulated fields.
            if (current.usageSummary && (!changes.usageSummary || (changes.tokens ?? 0) < (current.tokens ?? 0))) {
                for (const field of [
                    'usageSummary',
                    'tokens',
                    'inputTokens',
                    'outputTokens',
                    'totalPrice',
                    'currency',
                    'inputUnitPrice',
                    'inputPriceUnit',
                    'outputUnitPrice',
                    'outputPriceUnit',
                    'responseLatency'
                ] as const) {
                    delete changes[field]
                }
            }
            // Keep the freshly loaded audit values unchanged so TypeORM generates updatedAt.
            assign(current, changes, { completedAt })
            return manager.save(current)
        })
    }

    async recordUsage(id: string, usage: TExecutionUsageRecord) {
        await this.repository.manager.transaction(async (manager) => {
            if (usage.type === 'estimated' || !usage.details) {
                await manager.increment(XpertAgentExecution, { id }, 'tokens', usage.tokens)
                return
            }
            const current = await manager.findOne(XpertAgentExecution, {
                where: { id },
                select: {
                    id: true,
                    tokens: true,
                    inputTokens: true,
                    outputTokens: true,
                    currency: true,
                    totalPrice: true,
                    usageSummary: true
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!current) throw new NotFoundException()
            await manager.update(
                XpertAgentExecution,
                { id },
                accumulateActualExecutionUsage(current, usage.details, usage.tokens)
            )
        })
    }

    async findAllByParentId(id: string, options?: Omit<FindManyOptions<XpertAgentExecution>, 'where'>) {
        const { items } = await this.findAll({
            ...(options ?? {}),
            where: {
                parentId: id
            }
        })
        return items
    }

    /** Only called with execution IDs already resolved through tenant-scoped access checks. */
    async interruptRunning(ids: string[], threadId: string, error: string) {
        return this.repository.update(
            {
                id: In(ids),
                threadId,
                status: In([XpertAgentExecutionStatusEnum.RUNNING, XpertAgentExecutionStatusEnum.PENDING])
            },
            { status: XpertAgentExecutionStatusEnum.INTERRUPTED, error, completedAt: new Date() }
        )
    }

    async getChargedPoints(tenantId: string, executionIds: string[]): Promise<Map<string, number>> {
        if (!tenantId || !executionIds.length) return new Map()
        const rows: { id: string; points: string }[] = await this.repository.manager.query(
            `WITH requested AS (SELECT unnest($2::uuid[]) AS id) ${postedPointsByExecutionSql('requested')}`,
            [tenantId, executionIds]
        )
        return new Map(rows.map((row) => [row.id, Number(row.points)]))
    }

    async findAllByXpertAgent(
        xpertId: string,
        agentKey: string,
        options: PaginationParams<XpertAgentExecution>,
        createdById?: string
    ) {
        return await this.findAll({
            ...options,
            where: { xpertId, agentKey, parentId: IsNull(), ...(createdById ? { createdById } : {}) }
        })
    }
}
