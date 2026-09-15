import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { UserService } from '@xpert-ai/server-core'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Job, Queue } from 'bull'
import { KnowledgeTagService } from '../../knowledgebase/tags/knowledge-tag.service'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { KnowledgeProcessingReadyService } from '../processing-lifecycle.module'
import { normalizeAutomaticTagging } from './automatic-tagging'
import {
    JOB_KNOWLEDGE_AUTO_TAGGING,
    KnowledgeAutoTaggingEnqueueCommand,
    KnowledgeAutoTaggingJob
} from './automatic-tagging.command'
import { KnowledgeAutomaticTaggingService } from './automatic-tagging.service'

@CommandHandler(KnowledgeAutoTaggingEnqueueCommand)
export class KnowledgeAutoTaggingEnqueueHandler implements ICommandHandler<KnowledgeAutoTaggingEnqueueCommand> {
    constructor(
        @InjectQueue(JOB_KNOWLEDGE_AUTO_TAGGING) private readonly queue: Queue<KnowledgeAutoTaggingJob>,
        private readonly tags: KnowledgeTagService
    ) {}

    async execute({ input }: KnowledgeAutoTaggingEnqueueCommand) {
        const { document, knowledgebase } = await this.tags.context(input.knowledgebaseId, input.documentId)
        if (!normalizeAutomaticTagging(knowledgebase.automaticTagging).enabled) return
        return this.queue.add(
            { ...input, tenantId: document.tenantId, organizationId: document.organizationId },
            {
                jobId: `${document.id}-${document.publicationEpoch}-${document.tagRevision}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: true,
                removeOnFail: 100
            }
        )
    }
}

@Processor(JOB_KNOWLEDGE_AUTO_TAGGING)
export class KnowledgeAutoTaggingConsumer {
    private readonly logger = new Logger(KnowledgeAutoTaggingConsumer.name)
    constructor(
        private readonly users: UserService,
        private readonly tagging: KnowledgeAutomaticTaggingService,
        private readonly lifecycle: KnowledgeProcessingReadyService
    ) {}

    @Process({ concurrency: 2 })
    async process(job: Job<KnowledgeAutoTaggingJob>) {
        await this.lifecycle.waitUntilReady()
        const user = await this.users.findOne(job.data.userId, { relations: ['role'] })
        return runWithCapturedRequestContext(
            captureRequestContext({
                user,
                tenantId: job.data.tenantId,
                organizationId: job.data.organizationId,
                language: user.preferredLanguage
            }),
            () => this.tagging.process(job.data.knowledgebaseId, job.data.documentId)
        )
    }

    @OnQueueFailed()
    failed(job: Job<KnowledgeAutoTaggingJob>, error: Error) {
        this.logger.warn(`Automatic tagging failed for document '${job.data.documentId}': ${getErrorMessage(error)}`)
    }
}
