import { PaginationParams, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { assign, omit } from 'lodash'
import { DeepPartial, FindManyOptions, In, IsNull, Repository } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecution } from './agent-execution.entity'
import type { TExecutionUsageRecord } from './types'
import { executionCompletedAt } from './execution-timing'

@Injectable()
export class XpertAgentExecutionService extends TenantOrganizationAwareCrudService<XpertAgentExecution> {
    constructor(
        @InjectRepository(XpertAgentExecution)
        repository: Repository<XpertAgentExecution>
    ) {
        super(repository)
    }

    async create(entity: DeepPartial<XpertAgentExecution>, ...options: unknown[]) {
        // Audit timestamps belong to the ORM, not caller snapshots.
        const changes = omit(entity, ['createdAt', 'updatedAt'])
        return super.create({ ...changes, completedAt: executionCompletedAt(undefined, entity.status) }, ...options)
    }

    async update(id: string, entity: Partial<XpertAgentExecution>) {
        const changes = omit(entity, ['createdAt', 'updatedAt'])
        const scope = await super.findOne(id)
        // Serialize lifecycle and metadata saves so an older read cannot erase a concurrent end.
        return this.repository.manager.transaction(async (manager) => {
            const current = await manager.findOne(XpertAgentExecution, {
                where: { id, tenantId: scope.tenantId, organizationId: scope.organizationId ?? IsNull() },
                lock: { mode: 'pessimistic_write' }
            })
            if (!current) throw new NotFoundException()
            const completedAt = executionCompletedAt(current, changes.status)
            // Keep the freshly loaded audit values unchanged so TypeORM generates updatedAt.
            assign(current, changes, { completedAt })
            return manager.save(current)
        })
    }

    async recordUsage(id: string, usage: TExecutionUsageRecord) {
        await this.repository.manager.transaction(async (manager) => {
            await manager.increment(XpertAgentExecution, { id }, 'tokens', usage.tokens)

            if (usage.type !== 'estimated' && usage.details) {
                const details = usage.details
                await manager.update(
                    XpertAgentExecution,
                    { id },
                    {
                        responseLatency: typeof details.latency === 'number' ? details.latency / 1000 : 0,
                        currency: details.currency,
                        totalPrice: details.totalPrice,
                        inputTokens: details.promptTokens,
                        inputUnitPrice: details.promptUnitPrice,
                        inputPriceUnit: details.promptPriceUnit,
                        outputTokens: details.completionTokens,
                        outputUnitPrice: details.completionUnitPrice,
                        outputPriceUnit: details.completionPriceUnit
                    }
                )
            }
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
            { id: In(ids), threadId, status: XpertAgentExecutionStatusEnum.RUNNING },
            { status: XpertAgentExecutionStatusEnum.INTERRUPTED, error, completedAt: new Date() }
        )
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
