import { getErrorMessage } from '@xpert-ai/server-common'
import { UserService } from '@xpert-ai/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { Job } from 'bull'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { KnowledgeWikiGenerationService } from './knowledge-wiki-generation.service'
import { JOB_KNOWLEDGE_WIKI_GENERATION, KnowledgeWikiGenerationQueueJob } from './types'

@Processor({ name: JOB_KNOWLEDGE_WIKI_GENERATION })
export class KnowledgeWikiGenerationConsumer {
    private readonly logger = new Logger(KnowledgeWikiGenerationConsumer.name)

    constructor(
        @Inject(JOB_REF) jobRef: Job,
        private readonly service: KnowledgeWikiGenerationService,
        private readonly userService: UserService
    ) {}

    @Process({ concurrency: 2 })
    async process(job: Job<KnowledgeWikiGenerationQueueJob>) {
        const user = await this.userService.findOne(job.data.userId, { relations: ['role'] })
        const context = captureRequestContext({
            user,
            tenantId: job.data.tenantId,
            organizationId: job.data.organizationId,
            language: user?.preferredLanguage
        })
        try {
            return await runWithCapturedRequestContext(context, () => this.service.processJob(job.data.jobId))
        } catch (error) {
            this.logger.error(`Knowledge Wiki job '${job.data.jobId}' failed: ${getErrorMessage(error)}`)
            throw error
        }
    }
}
