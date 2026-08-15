import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/server-common'
import { ModelInvocation } from './model-invocation.entity'

export const MODEL_INVOCATION_QUEUE_PLUGIN = '@xpert-ai/platform'
export const MODEL_INVOCATION_QUEUE_NAME = 'model-invocation'
export const MODEL_INVOCATION_JOB_NAME = 'observe'

export type ModelInvocationQueuePayload = {
    invocationId: string
}

@Injectable()
export class ModelInvocationQueueService {
    readonly #logger = new Logger(ModelInvocationQueueService.name)

    constructor(
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly queue: ManagedQueueService
    ) {}

    async enqueue(invocation: ModelInvocation, delayMs = 0): Promise<void> {
        const dueAt = invocation.nextReconcileAt?.getTime() ?? Date.now() + Math.max(0, delayMs)
        try {
            await this.queue.enqueue<ModelInvocationQueuePayload>({
                pluginName: MODEL_INVOCATION_QUEUE_PLUGIN,
                queueName: MODEL_INVOCATION_QUEUE_NAME,
                jobName: MODEL_INVOCATION_JOB_NAME,
                payload: { invocationId: invocation.id },
                tenantId: invocation.tenantId,
                organizationId: invocation.organizationId,
                userId: invocation.userId,
                scopeKey: 'system:global',
                jobId: `model-invocation:${invocation.id}:${dueAt}`,
                delayMs: Math.max(0, delayMs),
                attempts: 8,
                backoffMs: { type: 'exponential', delay: 15_000 }
            })
        } catch (error) {
            this.#logger.warn(`Model invocation ${invocation.id} enqueue failed: ${getErrorMessage(error)}`)
        }
    }
}
