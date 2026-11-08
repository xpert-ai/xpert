import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { GroupMessageRecipient, GroupParticipant } from '../../group.entity'
import { groupDenied } from '../../group.errors'
import { GroupResourceToolsService } from '../../group-resource-tools.service'
import { groupRuntimeDeliveryId, hasGroupRuntime } from '../../group-runtime-context'
import { ResolveGroupResourceNavigationToolsCommand } from '../resolve-group-resource-navigation-tools.command'

@CommandHandler(ResolveGroupResourceNavigationToolsCommand)
export class ResolveGroupResourceNavigationToolsHandler implements ICommandHandler<ResolveGroupResourceNavigationToolsCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly resources: GroupResourceToolsService
    ) {}

    async execute({ invocation }: ResolveGroupResourceNavigationToolsCommand) {
        const { tenantId, organizationId, conversationId, assistantId, projectId, threadId } = invocation
        const scope = { tenantId, organizationId }
        const conversation = await this.db.getRepository(ChatConversation).findOneBy({ ...scope, id: conversationId })
        if (!conversation || conversation.projectId !== projectId) throw groupDenied()
        if (conversation.purpose !== 'group_assistant_runtime') {
            if (conversation.purpose === 'group' || hasGroupRuntime()) throw groupDenied()
            return { scope: 'project' as const }
        }

        const deliveryId = groupRuntimeDeliveryId(conversationId)
        if (!deliveryId || !threadId) throw groupDenied()
        const member = await this.db.getRepository(GroupParticipant).findOneBy({
            ...scope,
            runtimeConversationId: conversationId,
            runtimeThreadId: threadId,
            subjectId: assistantId,
            kind: 'assistant',
            active: true
        })
        if (!member) throw groupDenied()
        const receipt = await this.db.getRepository(GroupMessageRecipient).findOneBy({
            ...scope,
            id: deliveryId,
            groupId: member.groupId,
            participantId: member.id
        })
        if (!receipt?.executionId || !['starting', 'steering'].includes(receipt.status)) throw groupDenied()
        return { scope: 'group' as const, tools: this.resources.createNavigationTools(receipt, member) }
    }
}
