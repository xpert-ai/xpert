// Invariants: reserve under the root job's row lock before any provider call.
// All map/reduce children and retries share that reservation history; cached output is free to replay.
import { Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { DataSource } from 'typeorm'
import { KnowledgeWikiJob, KnowledgeWikiModelInvocation } from './entities'

@Injectable()
export class KnowledgeWikiInvocationBudgetService {
    constructor(private readonly dataSource: DataSource) {}

    reserve(job: KnowledgeWikiJob, candidate: KnowledgeWikiModelInvocation, estimatedTokens: number) {
        return this.dataSource.transaction(async (manager) => {
            const jobs = manager.getRepository(KnowledgeWikiJob)
            const invocations = manager.getRepository(KnowledgeWikiModelInvocation)
            const root = await jobs.findOne({
                where: { id: job.rootJobId ?? job.id, knowledgebaseId: candidate.knowledgebaseId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!root) throw this.budgetError()
            const existing = await invocations.findOne({ where: { requestId: candidate.requestId } })
            if (existing) return existing

            const budget = root.spendEnvelope
            if (budget) {
                const history = await invocations.find({
                    where: [{ jobId: root.id }, { job: { rootJobId: root.id } }],
                    select: { id: true, tokenUsage: true }
                })
                const spent = history.reduce((total, item) => {
                    const estimate = item.tokenUsage?.estimatedTokens ?? item.tokenUsage?.totalTokens
                    // Legacy/unfinished calls with no usage cannot safely be treated as free.
                    return total + (typeof estimate === 'number' && estimate > 0 ? estimate : Infinity)
                }, 0)
                if (
                    !Number.isSafeInteger(budget.maxModelInvocations) ||
                    budget.maxModelInvocations < 1 ||
                    !Number.isSafeInteger(budget.maxEstimatedTokens) ||
                    budget.maxEstimatedTokens < 1 ||
                    !Number.isSafeInteger(estimatedTokens) ||
                    estimatedTokens < 1 ||
                    history.length + 1 > budget.maxModelInvocations ||
                    spent + estimatedTokens > budget.maxEstimatedTokens
                ) {
                    throw this.budgetError()
                }
            }
            candidate.tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedTokens }
            return invocations.save(candidate)
        })
    }

    private budgetError() {
        return new Error(
            t('server-ai:Error.KnowledgebaseWikiBudgetExceeded', {
                defaultValue:
                    'Wiki model budget is exhausted or cannot be verified. Confirm a new rebuild budget to continue.'
            })
        )
    }
}
