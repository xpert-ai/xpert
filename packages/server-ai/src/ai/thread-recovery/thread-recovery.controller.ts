import { Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { SecretTokenBindingType, TChatThreadCapabilities } from '@xpert-ai/contracts'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    TransformInterceptor
} from '@xpert-ai/server-core'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'
import { ThreadRecoveryService } from '../../chat-conversation/recovery/thread-recovery.service'
import { assertPublicXpertSessionConversationAccess } from '../public-xpert-principal'
import { ThreadDTO } from '../dto/thread.dto'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('threads')
export class ThreadRecoveryController {
    constructor(
        private readonly recovery: ThreadRecoveryService,
        private readonly queryBus: QueryBus
    ) {}

    @Get(':thread_id/capabilities')
    async capabilities(@Param('thread_id') threadId: string): Promise<TChatThreadCapabilities> {
        await this.access(threadId, 'read')
        const { canRetry } = await this.recovery.describe(threadId)
        return { canRetry }
    }

    @Post(':thread_id/recovery/source')
    async returnToSource(@Param('thread_id') threadId: string) {
        await this.access(threadId, 'contribute')
        const sourceThreadId = await this.recovery.getSourceThreadId(threadId)
        await this.access(sourceThreadId, 'contribute')
        const thread = await this.recovery.returnToSource(threadId)
        return new ThreadDTO(thread.conversation, {}, thread)
    }

    private async access(threadId: string, operation: 'read' | 'contribute') {
        const conversation = await this.queryBus.execute(new AssertChatConversationAccessQuery({ threadId }, operation))
        await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
    }
}
