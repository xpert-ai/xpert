// Invariants: asynchronous execution restores only the exact published Assistant
// bound to the persisted actor/conversation. Computer consent and model policy remain separate checks.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { Xpert } from '../xpert/xpert.entity'
import { executionError } from './execution-errors'
import { ResolveAssistantExecutionIdentityCommand } from './resolve-assistant-execution-identity.command'

@CommandHandler(ResolveAssistantExecutionIdentityCommand)
export class ResolveAssistantExecutionIdentityHandler implements ICommandHandler<ResolveAssistantExecutionIdentityCommand> {
    constructor(
        @InjectRepository(User) private readonly users: Repository<User>,
        @InjectRepository(Xpert) private readonly assistants: Repository<Xpert>,
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>
    ) {}

    async execute({ actor, conversationId, xpertId }: ResolveAssistantExecutionIdentityCommand) {
        if (!actor.tenantId || !actor.organizationId || !actor.userId) throw executionError('Denied')
        const user = await this.users.findOneBy({ id: actor.userId, tenantId: actor.tenantId })
        if (user?.type !== UserType.COMMUNICATION) return null
        const principal = RequestContext.currentApiPrincipal()
        const conversation = conversationId
            ? await this.conversations.findOneBy({
                  id: conversationId,
                  tenantId: actor.tenantId,
                  organizationId: actor.organizationId,
                  createdById: actor.userId
              })
            : null
        if (
            conversationId &&
            (!conversation ||
                conversation.projectId ||
                conversation.purpose === 'group' ||
                conversation.purpose === 'group_assistant_runtime')
        )
            throw executionError('Denied')
        const audience = principal?.resourceScope?.kind === 'assistant' ? principal.resourceScope.xpertId : undefined
        const id = conversation?.xpertId ?? audience
        if (!id || (xpertId && xpertId !== id)) throw executionError('Denied')
        if (
            principal &&
            (principal.id !== actor.userId ||
                principal.tenantId !== actor.tenantId ||
                audience !== id ||
                principal.requestedUserId ||
                RequestContext.getOrganizationId() !== actor.organizationId)
        )
            throw executionError('Denied')
        const assistant = await this.assistants.findOne({
            where: {
                id,
                tenantId: actor.tenantId,
                organizationId: actor.organizationId,
                userId: actor.userId,
                latest: true
            },
            relations: ['agent', 'agent.copilotModel', 'copilotModel']
        })
        if (!assistant?.active || !assistant.publishAt || !assistant.latest) throw executionError('Denied')
        return {
            assistant,
            user: {
                ...user,
                principalType: 'api_key' as const,
                resourceScope: { kind: 'assistant' as const, xpertId: assistant.id },
                apiKeyUserId: user.id,
                ownerUserId: assistant.createdById,
                requestedOrganizationId: actor.organizationId
            }
        }
    }
}
