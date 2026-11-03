import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectQueue, Process, Processor } from '@nestjs/bull'
import { Job, Queue } from 'bull'
import {
    JOB_KNOWLEDGE_QUESTIONS,
    KnowledgeQuestionsJob,
    KnowledgeQuestionsEnqueueCommand
} from './question-generation.command'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { KnowledgeDocumentService } from '../document.service'
import { resolveKnowledgeDocumentParserConfig } from '../parser-config'
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
        private readonly commandBus: CommandBus,
        private readonly questions: KnowledgeQuestionGenerationService,
        private readonly lifecycle: KnowledgeProcessingReadyService
    ) {}

    @Process({ concurrency: 2 })
    async process(job: Job<KnowledgeQuestionsJob>) {
        await this.lifecycle.waitUntilReady()
        const identity = await this.commandBus.execute(
            new ResolveExecutionIdentityCommand({
                kind: 'user',
                userId: job.data.userId,
                tenantId: job.data.tenantId,
                organizationId: job.data.organizationId
            })
        )
        return runWithExecutionIdentity(identity, () =>
            this.questions.process(job.data.documentId, job.data.chunkId, job.data.force)
        )
    }
}
