import { PluginJobProcessor, type ManagedQueueJob } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import {
    MODEL_INVOCATION_JOB_NAME,
    MODEL_INVOCATION_QUEUE_NAME,
    MODEL_INVOCATION_QUEUE_PLUGIN,
    type ModelInvocationQueuePayload
} from './model-invocation-queue.service'
import { ModelInvocationReconciliationService } from './model-invocation-reconciliation.service'

@Injectable()
@PluginJobProcessor({
    pluginName: MODEL_INVOCATION_QUEUE_PLUGIN,
    queueName: MODEL_INVOCATION_QUEUE_NAME,
    jobName: MODEL_INVOCATION_JOB_NAME,
    concurrency: 8
})
export class ModelInvocationProcessor {
    constructor(private readonly reconciliation: ModelInvocationReconciliationService) {}

    async handle(job: ManagedQueueJob<ModelInvocationQueuePayload>): Promise<void> {
        await this.reconciliation.reconcileOne(job.data.invocationId)
    }
}
