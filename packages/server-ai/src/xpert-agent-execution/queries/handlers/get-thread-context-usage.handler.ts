import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, MoreThan, Repository } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../../agent-execution.entity'
import { GetThreadContextUsageQuery, TThreadContextUsage } from '../get-thread-context-usage.query'
import { FindXpertQuery } from '../../../xpert/queries'

@QueryHandler(GetThreadContextUsageQuery)
export class GetThreadContextUsageHandler implements IQueryHandler<GetThreadContextUsageQuery> {
    constructor(
        @InjectRepository(XpertAgentExecution)
        private readonly repository: Repository<XpertAgentExecution>,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: GetThreadContextUsageQuery): Promise<TThreadContextUsage> {
        const effectiveAgentKey = await this.resolveEffectiveAgentKey(command.threadId, command.agentKey)
        if (!effectiveAgentKey) {
            return this.empty(command.threadId, null)
        }

        const latestExecution = await this.repository.findOne({
            where: {
                threadId: command.threadId,
                agentKey: effectiveAgentKey
            },
            order: {
                createdAt: 'DESC',
                updatedAt: 'DESC'
            }
        })

        if (!latestExecution) {
            return this.empty(command.threadId, effectiveAgentKey)
        }

        // An execution with no reported model usage has a default zero, not an empty context.
        const measuredExecution =
            this.toNumber(latestExecution.inputTokens) > 0
                ? latestExecution
                : await this.repository.findOne({
                      where: {
                          threadId: command.threadId,
                          agentKey: effectiveAgentKey,
                          inputTokens: MoreThan(0)
                      },
                      order: { createdAt: 'DESC', updatedAt: 'DESC' }
                  })
        if (!measuredExecution) {
            return this.empty(command.threadId, effectiveAgentKey)
        }

        const failed =
            latestExecution.status === XpertAgentExecutionStatusEnum.ERROR ||
            latestExecution.status === XpertAgentExecutionStatusEnum.TIMEOUT ||
            latestExecution.status === XpertAgentExecutionStatusEnum.INTERRUPTED

        return {
            thread_id: command.threadId,
            agent_key: effectiveAgentKey,
            run_id: measuredExecution.id,
            updated_at: measuredExecution.updatedAt?.toISOString() ?? null,
            status: measuredExecution.id !== latestExecution.id || failed ? 'stale' : 'current',
            usage: this.toUsage(measuredExecution)
        }
    }

    private emptyUsage(): TThreadContextUsage['usage'] {
        return {
            context_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            embed_tokens: 0,
            total_price: 0,
            currency: null
        }
    }

    private toUsage(execution: XpertAgentExecution): TThreadContextUsage['usage'] {
        return {
            context_tokens: this.toNumber(execution.inputTokens),
            input_tokens: this.toNumber(execution.inputTokens),
            output_tokens: this.toNumber(execution.outputTokens),
            total_tokens: this.toNumber(execution.tokens),
            embed_tokens: this.toNumber(execution.embedTokens),
            total_price: this.toNumber(execution.totalPrice),
            currency: execution.currency ?? null
        }
    }

    private async resolveEffectiveAgentKey(threadId: string, requestedAgentKey?: string): Promise<string | null> {
        const normalizedRequested = this.normalizeAgentKey(requestedAgentKey)
        if (normalizedRequested) {
            return normalizedRequested
        }

        const rootExecution = await this.repository.findOne({
            where: {
                threadId,
                parentId: IsNull()
            },
            order: {
                updatedAt: 'DESC'
            }
        })
        if (!rootExecution) {
            return null
        }

        if (rootExecution.xpertId) {
            try {
                const xpert = await this.queryBus.execute(
                    new FindXpertQuery({ id: rootExecution.xpertId }, { relations: ['agent'] })
                )
                const primaryAgentKey = this.normalizeAgentKey(xpert?.agent?.key)
                if (primaryAgentKey) {
                    return primaryAgentKey
                }
            } catch {
                // Ignore and fallback to root execution agent key.
            }
        }

        return this.normalizeAgentKey(rootExecution.agentKey)
    }

    private normalizeAgentKey(value: unknown): string | null {
        if (typeof value !== 'string') {
            return null
        }
        const normalized = value.trim()
        return normalized ? normalized : null
    }

    private empty(threadId: string, agentKey: string | null): TThreadContextUsage {
        return {
            thread_id: threadId,
            agent_key: agentKey,
            run_id: null,
            updated_at: null,
            status: 'unavailable',
            usage: this.emptyUsage()
        }
    }

    private toNumber(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value
        }
        if (typeof value === 'string') {
            const parsed = Number.parseFloat(value)
            if (Number.isFinite(parsed)) {
                return parsed
            }
        }
        return 0
    }
}
