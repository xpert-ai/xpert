import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectQueue, Process, Processor } from '@nestjs/bull'
import { Job, Queue } from 'bull'
import {
    JOB_KNOWLEDGE_QUESTIONS,
    KnowledgeQuestionsJob,
    KnowledgeQuestionsEnqueueCommand
} from './question-generation.command'
import { UserService } from '@xpert-ai/server-core'
import { KnowledgeDocumentService } from '../document.service'
import { resolveKnowledgeDocumentParserConfig } from '../parser-config'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { KnowledgeQuestionGenerationService } from './question-generation.service'
import { KnowledgeProcessingReadyService } from '../processing-lifecycle.module'

@CommandHandler(KnowledgeQuestionsEnqueueCommand)
export class KnowledgeQuestionsEnqueueHandler implements ICommandHandler<KnowledgeQuestionsEnqueueCommand> {
    constructor(
        @InjectQueue(JOB_KNOWLEDGE_QUESTIONS) private readonly queue: Queue<KnowledgeQuestionsJob>,
        private readonly documents: KnowledgeDocumentService
    ) {}

    async execute({ input }: KnowledgeQuestionsEnqueueCommand) {
        await this.documents.assertDocumentWriteAccess(input.documentId)
        const document = await this.documents.findOne(input.documentId, { relations: ['knowledgebase'] })
        const config = resolveKnowledgeDocumentParserConfig(
            document,
            document.knowledgebase.parserConfig
        ).questionGeneration
        // No model calls for unconfigured libraries. Explicit opt-out also cleans up an earlier generation.
        if (!config) return
        return this.queue.add(
            { ...input, tenantId: document.tenantId, organizationId: document.organizationId },
            { attempts: 1, removeOnComplete: true, removeOnFail: 100 }
        )
    }
}

@Processor(JOB_KNOWLEDGE_QUESTIONS)
export class KnowledgeQuestionsConsumer {
    constructor(
        private readonly users: UserService,
        private readonly questions: KnowledgeQuestionGenerationService,
        private readonly lifecycle: KnowledgeProcessingReadyService
    ) {}

    @Process({ concurrency: 2 })
    async process(job: Job<KnowledgeQuestionsJob>) {
        await this.lifecycle.waitUntilReady()
        const user = await this.users.findOne(job.data.userId, { relations: ['role'] })
        // Jobs carry ids only. Read the current source and configuration instead of a stale upload snapshot.
        return runWithCapturedRequestContext(
            captureRequestContext({
                user,
                tenantId: job.data.tenantId,
                organizationId: job.data.organizationId,
                language: user.preferredLanguage
            }),
            () => this.questions.process(job.data.documentId, job.data.chunkId, job.data.force)
        )
    }
}
