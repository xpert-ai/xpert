import { ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { InjectRepository } from '@nestjs/typeorm'
import { IApiPrincipal, IUser } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { assertWorkbenchPrincipal } from './workbench-principal'

@Injectable()
export class WorkbenchFilesAuthGuard extends ApiKeyOrClientSecretAuthGuard {
    constructor(
        reflector: Reflector,
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>
    ) {
        super(reflector)
    }
    override async canActivate(context: ExecutionContext) {
        if (!(await super.canActivate(context))) return false
        const request = context
            .switchToHttp()
            .getRequest<{ user?: IUser | IApiPrincipal; params: { conversationId: string } }>()
        if (!request.user) throw new UnauthorizedException()
        assertWorkbenchPrincipal(request.user)
        const conversation = await this.conversations.findOneBy({ id: request.params.conversationId })
        if (!conversation)
            throw new NotFoundException(
                t('server-ai:Error.ConversationNotFound', { defaultValue: 'Conversation not found' })
            )
        assertWorkbenchPrincipal(request.user, conversation)
        return true
    }
}
