import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { assign } from 'lodash'
import { FindManyOptions, IsNull, Repository } from 'typeorm'
import { XpertAgentExecution } from './agent-execution.entity'
import type { TExecutionUsageRecord } from './types'

@Injectable()
export class XpertAgentExecutionService extends TenantOrganizationAwareCrudService<XpertAgentExecution> {
    constructor(
        @InjectRepository(XpertAgentExecution)
        repository: Repository<XpertAgentExecution>
    ) {
        super(repository)
    }

    async update(id: string, entity: Partial<XpertAgentExecution>) {
        const _entity = await super.findOne(id)
        assign(_entity, entity)
        return await this.repository.save(_entity)
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
