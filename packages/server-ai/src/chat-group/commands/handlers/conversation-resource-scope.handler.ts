import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { GroupParticipant } from '../../group.entity'
import { groupDenied } from '../../group.errors'
import { ResolveConversationResourceScopeCommand } from '../conversation-resource-scope.command'
import { ResolveGroupProjectAccessCommand } from '../group-project-access.command'

/** Resolve group identity from persistence, never from a plugin query or a shared Project ID. */
@CommandHandler(ResolveConversationResourceScopeCommand)
export class ResolveConversationResourceScopeHandler implements ICommandHandler<ResolveConversationResourceScopeCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly commands: CommandBus
    ) {}

    async execute({ scope }: ResolveConversationResourceScopeCommand) {
        if (!scope.conversationId) return { groupId: null }
        const boundary = { tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId }
        const conversation = await this.db.getRepository(ChatConversation).findOneBy({
            ...boundary,
            id: scope.conversationId
        })
        if (
            !conversation ||
            conversation.projectId !== scope.projectId ||
            !scope.assistantId ||
            conversation.xpertId !== scope.assistantId
        )
            throw groupDenied()
        if (conversation.purpose === 'group') throw groupDenied()
        if (conversation.purpose !== 'group_assistant_runtime') return { groupId: null }
        if (!conversation.threadId) throw groupDenied()
        const member = await this.db.getRepository(GroupParticipant).findOneBy({
            ...boundary,
            runtimeConversationId: conversation.id,
            runtimeThreadId: conversation.threadId,
            subjectId: scope.assistantId,
            kind: 'assistant',
            active: true
        })
        if (!member) throw groupDenied()
        const target = await this.commands.execute(
            new ResolveGroupProjectAccessCommand(scope.actor, member.groupId, 'read')
        )
        if (target.projectId !== scope.projectId) throw groupDenied()
        return { groupId: target.groupId }
    }
}
