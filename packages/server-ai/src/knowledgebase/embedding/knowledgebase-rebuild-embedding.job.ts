import { KnowledgeProcessingReadyService } from '../../knowledge-document/processing-lifecycle.module'
import { CommandBus } from '@nestjs/cqrs'
import { getErrorMessage } from '@xpert-ai/server-common'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { KnowledgebaseService } from '../management/knowledgebase.service'
import { JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING, TKnowledgebaseRebuildEmbeddingJob } from '../shared/types'

@Processor({
    name: JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING
})
export class KnowledgebaseRebuildEmbeddingConsumer {
    private readonly logger = new Logger(KnowledgebaseRebuildEmbeddingConsumer.name)

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly commandBus: CommandBus,
        private readonly lifecycle: KnowledgeProcessingReadyService
    ) {}

    @Process({ concurrency: 1 })
    async process(job: Job<TKnowledgebaseRebuildEmbeddingJob>) {
        await this.lifecycle.waitUntilReady()
        const data = job.data
        try {
            const identity = await this.commandBus.execute(
                new ResolveExecutionIdentityCommand({
                    kind: 'user',
                    userId: data.userId,
                    tenantId: data.tenantId,
                    organizationId: data.organizationId
                })
            )
            return await runWithExecutionIdentity(identity, () =>
                this.knowledgebaseService.processEmbeddingRebuildJob(data)
            )
        } catch (error) {
            const message = getErrorMessage(error)
            this.logger.error(`Embedding rebuild failed for knowledgebase '${data.knowledgebaseId}': ${message}`)
            await this.knowledgebaseService.markEmbeddingRebuildFailed(data, message)
            throw error
        }
    }
}
