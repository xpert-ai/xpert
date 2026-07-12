import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob } from '@xpert-ai/plugin-sdk'
import { CollaborationService } from './collaboration.service'

type CollaborationMaterializationJob = { documentId: string }

@Injectable()
@PluginJobProcessor({
    pluginName: '@xpert-ai/platform',
    queueName: 'collaboration',
    jobName: 'materialize',
    concurrency: 2
})
/** Retries failed provider projections against the newest authoritative document state. */
export class CollaborationMaterializationProcessor {
    constructor(private readonly collaboration: CollaborationService) {}

    async handle(job: ManagedQueueJob<CollaborationMaterializationJob>) {
        await this.collaboration.retryMaterialization(job.data.documentId)
    }
}
