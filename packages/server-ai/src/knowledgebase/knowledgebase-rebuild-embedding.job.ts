import { getErrorMessage } from '@xpert-ai/server-common'
import { UserService } from '@xpert-ai/server-core'
import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { KnowledgebaseService } from './knowledgebase.service'
import { JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING, TKnowledgebaseRebuildEmbeddingJob } from './types'

@Processor({
    name: JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING
})
export class KnowledgebaseRebuildEmbeddingConsumer {
    private readonly logger = new Logger(KnowledgebaseRebuildEmbeddingConsumer.name)

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly userService: UserService
    ) {}

    @Process({ concurrency: 1 })
    async process(job: Job<TKnowledgebaseRebuildEmbeddingJob>) {
        const data = job.data
        const user = await this.userService.findOne(data.userId, { relations: ['role'] })
        const headers: Record<string, string> = {
            language: user.preferredLanguage
        }
        if (data.organizationId) {
            headers['organization-id'] = data.organizationId
        }

        const context = captureRequestContext({
            user,
            tenantId: data.tenantId,
            organizationId: data.organizationId,
            language: headers.language
        })

        // Rebuild jobs may create model clients that read plugin-sdk context while
        // repository paths still depend on server-core context.
        return runWithCapturedRequestContext(context, () => this.processInRequestContext(data))
    }

    private async processInRequestContext(data: TKnowledgebaseRebuildEmbeddingJob) {
        try {
            await this.knowledgebaseService.findOne(data.knowledgebaseId)
            return await this.knowledgebaseService.processEmbeddingRebuildJob(data)
        } catch (error) {
            const message = getErrorMessage(error)
            this.logger.error(`Embedding rebuild failed for knowledgebase '${data.knowledgebaseId}': ${message}`)
            await this.knowledgebaseService.markEmbeddingRebuildFailed(data, message)
            throw error
        }
    }
}
