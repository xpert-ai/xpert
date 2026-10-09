import { IApiPrincipal, IUser, SecretTokenBindingType } from '@xpert-ai/contracts'
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'

/**
 * Constrains authenticated API credentials to a persisted Assistant thread.
 * Use after ApiKeyOrClientSecretAuthGuard; this guard never validates tokens.
 * API keys and client secrets must carry an explicit Assistant binding. Public
 * and enterprise sessions additionally stay within their own conversations.
 * Services still enforce conversation ownership and Project operation access,
 * including for ordinary login users, who have no credential-bound Assistant.
 */
@Injectable()
export class AssistantThreadScopeGuard implements CanActivate {
    constructor(
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        @InjectRepository(ChatConversationThread) private readonly threads: Repository<ChatConversationThread>
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{
            user?: IUser | IApiPrincipal
            params?: { threadId?: string; thread_id?: string }
            query?: { organizationId?: string }
        }>()
        const principal = request.user
        if (!principal?.id) throw new UnauthorizedException()
        if (
            request.params?.threadId &&
            request.params?.thread_id &&
            request.params.threadId !== request.params.thread_id
        )
            throw new ForbiddenException()
        const requestedThreadId = request.params?.threadId ?? request.params?.thread_id
        let conversation: ChatConversation | null = null
        if (requestedThreadId) {
            const row = await this.threads.findOne({
                where: { threadId: requestedThreadId },
                relations: { conversation: true }
            })
            // Older root threads predate the conversation-thread table.
            conversation = row?.conversation ?? (await this.conversations.findOneBy({ threadId: requestedThreadId }))
            // Shared timelines and execution state are exposed through membership-authorized group APIs only.
            if (conversation?.purpose && conversation.purpose !== 'private') throw new ForbiddenException()
        }
        if (!('principalType' in principal)) return true

        const denied = () =>
            new ForbiddenException(
                t('server-ai:Error.AssistantAccessForbidden', {
                    defaultValue: 'You do not have access to this assistant.'
                })
            )
        // AI routes use both camelCase and SDK-style snake_case parameters.
        const threadId = request.params?.threadId ?? request.params?.thread_id
        if (
            principal.resourceScope?.kind !== 'assistant' ||
            !principal.resourceScope.xpertId ||
            !threadId ||
            !principal.tenantId ||
            (principal.apiKey && principal.apiKey.tenantId !== principal.tenantId)
        )
            throw denied()

        const organizationId =
            (principal.apiKey ? principal.apiKey.organizationId : principal.requestedOrganizationId) ?? null
        if (
            (request.query?.organizationId && request.query.organizationId !== organizationId) ||
            (principal.requestedOrganizationId && principal.requestedOrganizationId !== organizationId)
        )
            throw denied()

        if (
            !conversation ||
            conversation.tenantId !== principal.tenantId ||
            (conversation.organizationId ?? null) !== organizationId ||
            conversation.xpertId !== principal.resourceScope.xpertId
        )
            throw denied()

        if (
            principal.principalType === 'client_secret' &&
            (principal.clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT ||
                principal.clientSecretBindingType === SecretTokenBindingType.ENTERPRISE_XPERT) &&
            conversation.createdById !== principal.id
        )
            throw denied()

        return true
    }
}
