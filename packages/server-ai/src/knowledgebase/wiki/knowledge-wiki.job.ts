import { KnowledgeProcessingReadyService } from '../../knowledge-document/processing-lifecycle.module'
import { CommandBus } from '@nestjs/cqrs'
import { getErrorMessage } from '@xpert-ai/server-common'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { Job } from 'bull'
import { KnowledgeWikiGenerationService } from './knowledge-wiki-generation.service'
import { JOB_KNOWLEDGE_WIKI_GENERATION, KnowledgeWikiGenerationQueueJob } from './types'

@Processor({ name: JOB_KNOWLEDGE_WIKI_GENERATION })
export class KnowledgeWikiGenerationConsumer {
    private readonly logger = new Logger(KnowledgeWikiGenerationConsumer.name)

    constructor(
        @Inject(JOB_REF) jobRef: Job,
        private readonly service: KnowledgeWikiGenerationService,
        private readonly commandBus: CommandBus,
        private readonly lifecycle: KnowledgeProcessingReadyService
    ) {}

    @Process({ concurrency: 2 })
    async process(job: Job<KnowledgeWikiGenerationQueueJob>) {
        await this.lifecycle.waitUntilReady()
        try {
            const identity = await this.commandBus.execute(
                new ResolveExecutionIdentityCommand({
                    kind: 'user',
                    userId: job.data.userId,
                    tenantId: job.data.tenantId,
                    organizationId: job.data.organizationId
                })
            )
            return await runWithExecutionIdentity(identity, () => this.service.processJob(job.data.jobId))
        } catch (error) {
            this.logger.error(`Knowledge Wiki job '${job.data.jobId}' failed: ${getErrorMessage(error)}`)
            throw error
        }
    }
}
