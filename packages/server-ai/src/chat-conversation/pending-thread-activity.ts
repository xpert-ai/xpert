import type { IChatConversationUnreadXpertSummary } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import type { ChatConversation } from './conversation.entity'

/** Only routable human interrupts leave the server. Command arguments and question text stay in the chat. */
export async function pendingThreadActivity(
    repository: Repository<ChatConversation>,
    tenantId: string,
    organizationId: string | null | undefined,
    userId: string,
    xpertIds: string[]
) {
    type Summary = Required<Pick<IChatConversationUnreadXpertSummary, 'pendingThreadCount' | 'pendingThreads'>>
    const rows = await repository.query<Array<Summary & { xpertId: string }>>(
        `WITH conversations AS (
            SELECT c.id, c."xpertId", c."threadId", c.status, c.operation, c."updatedAt"
            FROM chat_conversation c
            WHERE c."tenantId" = $1 AND c."organizationId" IS NOT DISTINCT FROM $2::uuid
              AND c."createdById" = $3 AND c."xpertId" = ANY($4::uuid[])
              AND c.purpose = 'private'
        ), waiting AS (
            SELECT c."xpertId", t."threadId", t.operation, t."updatedAt"
            FROM conversations c JOIN chat_conversation_thread t ON t."conversationId" = c.id
            WHERE t."tenantId" = $1 AND t."organizationId" IS NOT DISTINCT FROM $2::uuid
              AND t.status = 'interrupted'
            UNION ALL
            SELECT c."xpertId", c."threadId", c.operation::jsonb, c."updatedAt"
            FROM conversations c WHERE c.status = 'interrupted' AND c."threadId" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM chat_conversation_thread t WHERE t."threadId" = c."threadId")
        ), classified AS (
            SELECT "xpertId", "threadId", "updatedAt", CASE
                WHEN operation @? '$.tasks[*].interrupts[*].value.clientToolCalls[*] ? (@.name == "request_user_input")'
                    THEN 'question'
                WHEN operation @? '$.tasks[*].interrupts[*].value.actionRequests[*].name'
                    THEN 'approval'
            END AS kind FROM waiting
        ), ranked AS (
            SELECT "xpertId", "threadId", kind,
                row_number() OVER (ORDER BY "updatedAt" DESC NULLS LAST, "threadId") AS rank
            FROM classified WHERE kind IS NOT NULL
        )
        SELECT "xpertId", count(*)::int AS "pendingThreadCount",
            COALESCE(jsonb_agg(jsonb_build_object('threadId', "threadId", 'kind', kind, 'rank', rank)
                ORDER BY rank) FILTER (WHERE rank <= 100), '[]'::jsonb) AS "pendingThreads"
        FROM ranked GROUP BY "xpertId"`,
        [tenantId, organizationId ?? null, userId, xpertIds]
    )
    return new Map(
        rows.map(
            ({ xpertId, pendingThreadCount, pendingThreads }) =>
                [xpertId, { pendingThreadCount, pendingThreads }] as const
        )
    )
}
