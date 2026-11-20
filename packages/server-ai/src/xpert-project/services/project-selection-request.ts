import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { attachMessageWidget } from '../../chat-message/widgets/message-widgets'
import { emitMessageWidget } from '../../chat-message/widgets/message-widget-stream'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { assertTextConversation } from './text-conversation-eligibility'
import { assertConversationTurnAccess, type ConversationTurn } from '../../chat-conversation/conversation-turn'

@Injectable()
export class ProjectSelectionService {
    constructor(
        private readonly db: DataSource,
        private readonly queries: QueryBus
    ) {}

    async request(turn: ConversationTurn) {
        if (!turn.isStart || turn.leaderKey) throw new ForbiddenException('Project selection unavailable')
        await assertConversationTurnAccess(this.queries, turn)
        await issueProjectSelection(this.db, turn)
    }
}

export async function issueProjectSelection(db: DataSource, turn: ConversationTurn) {
    // Bind to a persisted human input from this branch, not a message ID supplied by the model.
    const reference = await db.transaction(async (manager) => {
        const rows: { widgetId: string; messageId: string }[] = await manager.query(
            `
        WITH origin AS (SELECT ai.id AS ai_id, ai."executionId" AS run_id, m.id AS human_id FROM chat_conversation c
        JOIN chat_conversation_thread t ON t."conversationId"=c.id
        JOIN chat_message ai ON ai."conversationId"=c.id AND ai.id=t."headMessageId" AND ai.role='ai'
        JOIN chat_message m ON m.id=ai."parentId" AND m."conversationId"=c.id AND m.role='human'
        WHERE c.id=$1 AND t."threadId"=$2 AND c."createdById"=$3 AND c."tenantId"=$4
          AND c."organizationId" IS NOT DISTINCT FROM $5 AND c."projectId" IS NULL AND c.purpose='private'
          AND ai."executionId" IS NOT NULL AND ($7::uuid IS NULL OR m.id=$7)
          AND ai."executionId"=$8
        ), issued AS (
            INSERT INTO conversation_project_move AS r (conversation_id,thread_id,source_message_id,source_execution_id,destination)
            SELECT $1,$2,human_id,run_id,$6 FROM origin
            ON CONFLICT (conversation_id,source_message_id) DO UPDATE SET destination=r.destination
            WHERE r.source_execution_id=excluded.source_execution_id AND NOT r.dismissed
            RETURNING id
        ) SELECT issued.id AS "widgetId",origin.ai_id AS "messageId" FROM issued,origin`,
            [
                turn.conversationId,
                turn.threadId,
                turn.userId,
                turn.tenantId,
                turn.organizationId ?? null,
                'existing',
                turn.inputMessageId ?? null,
                turn.executionId
            ]
        )
        if (!rows[0]) throw new ConflictException('This conversation cannot request a project here')
        const conversation = await manager.findOneByOrFail(ChatConversation, { id: turn.conversationId })
        await assertTextConversation(manager, conversation, turn.executionId)
        return attachMessageWidget(manager, turn.conversationId, {
            ...rows[0],
            threadId: turn.threadId,
            provider: 'project.move'
        })
    })
    await emitMessageWidget(reference)
}
