import { Injectable } from '@nestjs/common'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { GroupParticipant, GroupMessageRecipient } from './group.entity'
import { GroupMessagesService } from './group-messages.service'
import { GroupAccessService } from './group-access.service'
import { GroupOutboxService } from './group-outbox.service'
import { groupDenied, groupInvalid } from './group.errors'
import { parseGroupCommunication, groupSendSchema } from './group.schema'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { groupToolInputSchema } from './group-tools.schema'

/**
 * Invariants: a tool is bound to the calling member and execution, never to model-supplied identity.
 * Requests inherit the initiating human's access; replies derive their recipient in publication.
 * Runtime tool-call IDs identify replayed publications; delivery reuses the existing Handoff outbox.
 */
@Injectable()
export class GroupToolsService {
    constructor(
        private readonly db: DataSource,
        private readonly messages: GroupMessagesService,
        private readonly access: GroupAccessService,
        private readonly outbox: GroupOutboxService
    ) {}

    /** Bind this run’s public messaging tool; each invocation rechecks the live runtime and membership. */
    create(recipient: GroupMessageRecipient, member: GroupParticipant) {
        return new DynamicStructuredTool({
            name: 'send_group_message',
            description:
                'Send a public group message as yourself. request asks recipients to respond; reply answers a specific request and derives its recipient; message posts progress without invoking assistants. Returns immediately; do not wait or poll for a response.',
            schema: groupToolInputSchema,
            func: async (input, _runManager, config) => {
                const thread = await this.db
                    .getRepository(ChatConversationThread)
                    .findOneBy({ threadId: member.runtimeThreadId, conversationId: member.runtimeConversationId })
                if (thread?.status !== 'busy' || thread.runControl?.executionId !== recipient.executionId)
                    throw groupDenied()
                const current = await this.db.getRepository(GroupParticipant).findOneBy({ id: member.id, active: true })
                if (!current) throw groupDenied()
                const group = await this.db.getRepository(ChatConversation).findOneByOrFail({ id: member.groupId })
                const original = await this.db.getRepository(ChatMessage).findOneByOrFail({ id: recipient.messageId })
                const root = parseGroupCommunication(original.groupCommunication)
                // Tool-call ID is supplied by the runtime, never by model arguments.
                const toolCall: unknown = config && 'toolCall' in config ? config.toolCall : undefined
                const callId =
                    toolCall && typeof toolCall === 'object' && 'id' in toolCall && typeof toolCall.id === 'string'
                        ? toolCall.id
                        : undefined
                if (!callId) throw groupInvalid()
                // Add host-owned metadata, then enforce the shared per-intent publication contract.
                const parsed = groupSendSchema.parse({
                    ...input,
                    clientMessageId: randomUUID(),
                    ...(input.intent === 'message' && !input.recipientIds ? { recipientIds: [] } : {})
                })
                const result = await this.access.withRootUser(group, root.rootUserId, async () => {
                    for (const id of input.recipientIds ?? []) {
                        const target = await this.db
                            .getRepository(GroupParticipant)
                            .findOneBy({ id, groupId: group.id, active: true })
                        if (!target) throw groupDenied()
                        if (target.kind === 'assistant') await this.access.assistant(target.subjectId)
                    }
                    return this.messages.publish(
                        group,
                        current,
                        parsed,
                        root,
                        `tool:${recipient.executionId}:${callId}`,
                        false,
                        original.id
                    )
                })
                // Publication commits before dispatch; never wait here for another member to reply.
                await this.outbox.flush(group.id)
                return JSON.stringify({ messageId: result.id, deliveries: result.deliveries })
            }
        })
    }
}
