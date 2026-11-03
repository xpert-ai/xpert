import { executionIdentityFixture } from '../../shared/testing/execution-identity.fixture'
jest.mock('../document.service', () => ({ KnowledgeDocumentService: class {} }))
jest.mock('./question-generation.service', () => ({ KnowledgeQuestionGenerationService: class {} }))
import { getQueueToken } from '@nestjs/bull'
import { BullExplorer } from '@nestjs/bull/dist/bull.explorer'
import { BullMetadataAccessor } from '@nestjs/bull/dist/bull-metadata.accessor'
import { DiscoveryModule } from '@nestjs/core'
import { CqrsModule, CommandHandler } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ResolveExecutionIdentityCommand } from '@xpert-ai/server-core'
import { Job } from 'bull'
import { JOB_KNOWLEDGE_QUESTIONS, KnowledgeQuestionsJob } from './question-generation.command'
import { KnowledgeQuestionsConsumer } from './question-generation.job'
import { KnowledgeQuestionGenerationService } from './question-generation.service'
import { KnowledgeProcessingLifecycleModule } from '../processing-lifecycle.module'

@CommandHandler(ResolveExecutionIdentityCommand)
class StartupQueryHandler {
    execute() {
        return executionIdentityFixture({ userId: 'user', tenantId: 'tenant' })
    }
}

describe('knowledge question worker startup', () => {
    it('holds jobs discovered by Bull until CQRS has registered handlers', async () => {
        let result: Promise<unknown> | undefined
        const questions = { process: jest.fn(async () => 'processed') }
        const queue = {
            process: jest.fn((_concurrency: number, handler: (job: Job<KnowledgeQuestionsJob>) => Promise<unknown>) => {
                result = handler({
                    data: { userId: 'user', tenantId: 'tenant', documentId: 'doc' }
                } as Job<KnowledgeQuestionsJob>).catch((error: unknown) => error)
            })
        }
        const app = await Test.createTestingModule({
            imports: [CqrsModule, DiscoveryModule, KnowledgeProcessingLifecycleModule],
            providers: [
                BullExplorer,
                BullMetadataAccessor,
                StartupQueryHandler,
                KnowledgeQuestionsConsumer,
                { provide: getQueueToken(JOB_KNOWLEDGE_QUESTIONS), useValue: queue },
                { provide: KnowledgeQuestionGenerationService, useValue: questions }
            ]
        }).compile()
        try {
            await app.init()
            expect(queue.process).toHaveBeenCalledTimes(1)
            await expect(result).resolves.toBe('processed')
            expect(questions.process).toHaveBeenCalledTimes(1)
        } finally {
            await app.close()
        }
    })
})
