import { ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IApiPrincipal, IUser, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { assertWorkbenchPrincipal } from './workbench-principal'
import { assertGroupWorkspaceFileAccess } from '../chat-conversation/workspace-files/group-workspace-file-access'

@Injectable()
export class WorkbenchFilesAuthGuard extends ApiKeyOrClientSecretAuthGuard {
    constructor(
        reflector: Reflector,
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        private readonly commands: CommandBus,
        queries: QueryBus
    ) {
        super(reflector, queries)
    }
    override async canActivate(context: ExecutionContext) {
        if (!(await super.canActivate(context))) return false
        const request = context
            .switchToHttp()
            .getRequest<{ user?: IUser | IApiPrincipal; params: { conversationId: string } }>()
        if (!request.user) throw new UnauthorizedException()
        const groupCredential =
            'principalType' in request.user &&
            request.user.principalType === 'client_secret' &&
            request.user.clientSecretBindingType === SecretTokenBindingType.USER_CONVERSATION
        if (!groupCredential) assertWorkbenchPrincipal(request.user)
        const conversation = await this.conversations.findOneBy({ id: request.params.conversationId })
        if (!conversation)
            throw new NotFoundException(
                t('server-ai:Error.ConversationNotFound', { defaultValue: 'Conversation not found' })
            )
        if (conversation.purpose === 'group_assistant_runtime') {
            await assertGroupWorkspaceFileAccess(this.commands, conversation)
        } else {
            assertWorkbenchPrincipal(request.user, conversation)
        }
        return true
    }
}
