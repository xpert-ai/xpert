// Retry only a PostgreSQL lock timeout after the whole admission transaction rolled
// back. Every attempt re-resolves work and authority; no inference has been admitted.
import { Logger } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { setTimeout } from 'node:timers/promises'
import type { PipelineModelBudgetCall } from './pipeline-model-budget.command'

const logger = new Logger('PipelineModelBudgetAdmission')

export async function retryPipelineModelAdmission<T>(
    call: Pick<PipelineModelBudgetCall, 'executionId' | 'requestId'>,
    transaction: () => Promise<T>
): Promise<T> {
    const identity = { executionId: call.executionId, requestId: call.requestId }
    let firstFailure: QueryFailedError | undefined
    for (let attempt = 1; ; attempt++) {
        try {
            const result = await transaction()
            if (firstFailure) logger.warn({ event: 'pipeline.model.admission.recovered', ...identity, attempt })
            return result
        } catch (error) {
            if (!(error instanceof QueryFailedError) || !('code' in error) || error.code !== '55P03') throw error
            firstFailure ??= error
            logger.warn({
                event: 'pipeline.model.admission.lock_timeout',
                ...identity,
                attempt,
                retry: attempt < 3
            })
            if (attempt === 3) throw firstFailure
            await setTimeout(attempt * 100)
        }
    }
}
