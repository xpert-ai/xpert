import { Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { KnowledgeQuestionGenerationService } from './question-generation.service'
import { KnowledgeQuestionsEnqueueCommand } from './question-generation.command'

@Controller()
export class KnowledgeQuestionGenerationController {
    constructor(
        private readonly questions: KnowledgeQuestionGenerationService,
        private readonly commands: CommandBus
    ) {}

    @Get(':documentId/chunk/:chunkId/questions')
    read(@Param('documentId') documentId: string, @Param('chunkId') chunkId: string) {
        return this.questions.read(documentId, chunkId)
    }

    @Post(':documentId/chunk/:chunkId/questions/regenerate')
    async regenerate(@Param('documentId') documentId: string, @Param('chunkId') chunkId: string) {
        await this.questions.assertCanRegenerate(documentId, chunkId)
        await this.commands.execute(
            new KnowledgeQuestionsEnqueueCommand({
                documentId,
                chunkId,
                userId: RequestContext.currentUserId(),
                force: true
            })
        )
        return { queued: true }
    }

    @Delete(':documentId/chunk/:chunkId/questions/:questionId')
    remove(
        @Param('documentId') documentId: string,
        @Param('chunkId') chunkId: string,
        @Param('questionId') questionId: string
    ) {
        return this.questions.remove(documentId, chunkId, questionId)
    }
}
