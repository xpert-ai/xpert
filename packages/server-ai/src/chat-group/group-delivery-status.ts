import { DataSource, In } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { GroupMessageRecipient, GroupParticipant } from './group.entity'

/** A reserved/busy run is not an acknowledgement of a particular input. Keep queue state unchanged. */
export async function consumedGroupReceipts(
    db: DataSource,
    group: Pick<ChatConversation, 'id' | 'tenantId' | 'organizationId'>,
    receipts: GroupMessageRecipient[]
): Promise<Set<string>> {
    const ids = receipts
        .filter((receipt) => receipt.wake && ['starting', 'steering'].includes(receipt.status))
        .map((receipt) => receipt.id)
    if (!ids.length) return new Set()
    const consumed = await db
        .getRepository(GroupMessageRecipient)
        .createQueryBuilder('receipt')
        .select('receipt.id', 'id')
        .distinct(true)
        .innerJoin(
            GroupParticipant,
            'participant',
            'participant.id = receipt.participantId AND participant.groupId = receipt.groupId ' +
                'AND participant.tenantId = receipt.tenantId AND participant.organizationId = receipt.organizationId ' +
                "AND participant.kind = 'assistant'"
        )
        .innerJoin(
            ChatMessage,
            'input',
            'input.conversationId = participant.runtimeConversationId ' +
                'AND input.createdInThreadId = participant.runtimeThreadId ' +
                'AND input.tenantId = receipt.tenantId AND input.organizationId = receipt.organizationId ' +
                "AND input.role = 'human' AND input.messageEnvelope ->> 'presentation' = 'runtime' " +
                "AND input.messageEnvelope -> 'correlation' ->> 'messageId' = CAST(receipt.id AS text)"
        )
        .where({ id: In(ids), groupId: group.id, tenantId: group.tenantId, organizationId: group.organizationId })
        .andWhere(
            "((receipt.status = 'starting' AND input.followUpStatus IS NULL) OR input.followUpStatus = 'consumed')"
        )
        .getRawMany<{ id: string }>()
    return new Set(consumed.map((row) => row.id))
}
