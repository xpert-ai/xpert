import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProjectGroupDisplayCommand } from '../project-group-display.command'
import { GroupMessageRecipient, GroupParticipant } from '../../group.entity'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { GroupMessagesService } from '../../group-messages.service'
import { GroupAnalysisStreamingCommand } from '../../../artifacts/analysis/commands/group-analysis-streaming.command'
import { groupDisplayContent } from '../../group-display'
import { parseGroupCommunication } from '../../group.schema'
import { GroupResourceToolsService } from '../../group-resource-tools.service'

/** Producer-owned persistence; no observer connection is required and retries update the same public row. */
@CommandHandler(ProjectGroupDisplayCommand)
export class ProjectGroupDisplayHandler implements ICommandHandler<ProjectGroupDisplayCommand> {
    constructor(
        @InjectRepository(GroupMessageRecipient)
        private readonly receipts: Repository<GroupMessageRecipient>,
        @InjectRepository(GroupParticipant)
        private readonly participants: Repository<GroupParticipant>,
        @InjectRepository(ChatMessage)
        private readonly chatMessages: Repository<ChatMessage>,
        @InjectRepository(ChatConversationThread)
        private readonly threads: Repository<ChatConversationThread>,
        @InjectRepository(ChatConversation)
        private readonly conversations: Repository<ChatConversation>,
        private readonly messages: GroupMessagesService,
        private readonly commands: CommandBus,
        private readonly resources: GroupResourceToolsService
    ) {}
    async execute({ tenantId, organizationId, receiptId, outputId, content }: ProjectGroupDisplayCommand) {
        const display = groupDisplayContent(content)
        if (!tenantId || !organizationId || !receiptId || !outputId || !display.length) return
        const scope = { tenantId, organizationId }
        const receipt = await this.receipts.findOneBy({ ...scope, id: receiptId })
        if (!receipt?.executionId || ['blocked', 'canceled', 'failed'].includes(receipt.status)) return
        const member = await this.participants.findOneBy({
            ...scope,
            id: receipt.participantId,
            groupId: receipt.groupId,
            kind: 'assistant',
            active: true
        })
        if (!member) return
        const output = await this.chatMessages.findOneBy({
            ...scope,
            id: outputId,
            conversationId: member.runtimeConversationId,
            executionId: receipt.executionId,
            role: 'ai'
        })
        const thread = await this.threads.findOneBy({ ...scope, threadId: member.runtimeThreadId })
        if (!output || thread?.runControl?.executionId !== receipt.executionId || thread.status !== 'busy') return
        // Governed analysis waits for terminal delivery validation; streaming must not bypass revocation checks.
        if (
            await this.commands.execute(
                new GroupAnalysisStreamingCommand(tenantId, organizationId, receipt.groupId, receipt.executionId)
            )
        )
            return
        const group = await this.conversations.findOneBy({ ...scope, id: receipt.groupId, purpose: 'group' })
        const source = await this.chatMessages.findOneBy({
            ...scope,
            id: receipt.messageId,
            conversationId: receipt.groupId
        })
        if (!group || !source) return
        const root = parseGroupCommunication(source.groupCommunication)
        await this.resources.validateAnalysisDelivery(receipt, member, group, root.rootUserId)
        await this.messages.publish(
            group,
            member,
            { intent: 'message', recipientIds: [], text: '', clientMessageId: output.id },
            root,
            `display:${output.id}`,
            true,
            source.id,
            undefined,
            display
        )
    }
}
