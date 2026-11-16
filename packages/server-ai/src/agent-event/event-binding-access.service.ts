import { ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { parseOpenConversationAction } from '@xpert-ai/contracts'
import { In } from 'typeorm'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { AssertProjectAssistantAccessCommand } from '../xpert-project/commands/assert-project-assistant-access.command'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { AgentEventBinding } from './agent-event.entity'

@Injectable()
export class EventBindingAccessService {
    constructor(
        private readonly published: PublishedXpertAccessService,
        private readonly workspaces: XpertWorkspaceAccessService,
        private readonly commands: CommandBus,
        private readonly queries: QueryBus
    ) {}

    async conversationAction(binding: AgentEventBinding, conversationId: string) {
        const family = await this.published.getAccessiblePublishedXpertFamilyIds(binding.xpertId)
        const conversation = await this.queries.execute(
            new AssertChatConversationAccessQuery(
                {
                    id: conversationId,
                    tenantId: binding.tenantId,
                    organizationId: binding.organizationId,
                    xpertId: In(family),
                    ...(binding.projectId ? { projectId: binding.projectId } : {})
                },
                'read'
            )
        )
        if (!conversation.threadId) return undefined
        return parseOpenConversationAction({
            type: 'open_conversation',
            assistantId: binding.xpertId,
            conversationId: conversation.id,
            threadId: conversation.threadId
        })
    }

    async assertAccessible(binding: AgentEventBinding) {
        const target = await this.published.getAccessiblePublishedXpert(binding.xpertId)
        if (target.workspaceId !== binding.workspaceId || target.organizationId !== binding.organizationId)
            throw new ForbiddenException()
        if (binding.projectId)
            await this.commands.execute(new AssertProjectAssistantAccessCommand(binding.projectId, binding.xpertId))
        await this.workspaces.assertCanAuthor(binding.workspaceId)
        return target.title || target.name
    }
}
