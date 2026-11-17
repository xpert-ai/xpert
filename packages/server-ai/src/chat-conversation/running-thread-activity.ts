import type { IChatConversationUnreadXpertSummary } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { ChatConversation } from './conversation.entity'
import type { XpertProjectAccessService } from '../xpert-project/services/project-access.service'

/** Only the current user's private activity belongs on the desktop. Project access can be revoked after creation. */
export async function runningThreadActivity(
    repository: Repository<ChatConversation>,
    projects: Pick<XpertProjectAccessService, 'assertCanRead'>,
    tenantId: string,
    organizationId: string | null | undefined,
    userId: string,
    xpertIds: string[]
) {
    type Threads = NonNullable<IChatConversationUnreadXpertSummary['runningThreads']>
    const rows = await repository.query<Array<Threads[number] & { xpertId: string; projectId: string | null }>>(
        `WITH conversations AS (
            SELECT c.id, c."xpertId", c."projectId", c."threadId", c.title, c.status, c."updatedAt"
            FROM chat_conversation c
            WHERE c."tenantId" = $1 AND c."organizationId" IS NOT DISTINCT FROM $2::uuid
              AND c."createdById" = $3 AND c."xpertId" = ANY($4::uuid[]) AND c.purpose = 'private'
        ), running AS (
            SELECT c."xpertId", c."projectId", t."threadId",
                COALESCE(NULLIF(BTRIM(t.metadata->>'title'), ''), NULLIF(BTRIM(c.title), '')) AS title, t."updatedAt"
            FROM conversations c JOIN chat_conversation_thread t ON t."conversationId" = c.id
            WHERE t."tenantId" = $1 AND t."organizationId" IS NOT DISTINCT FROM $2::uuid
              AND t.status IN ('busy', 'pausing')
            UNION ALL
            SELECT c."xpertId", c."projectId", c."threadId", NULLIF(BTRIM(c.title), ''), c."updatedAt"
            FROM conversations c WHERE c.status IN ('busy', 'pausing') AND c."threadId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM chat_conversation_thread t WHERE t."threadId" = c."threadId")
        )
        SELECT "xpertId", "projectId", "threadId", title FROM running ORDER BY "updatedAt" DESC NULLS LAST, "threadId"`,
        [tenantId, organizationId ?? null, userId, xpertIds]
    )
    const result = new Map<string, Threads>()
    const readable = new Map<string, boolean>()
    for (const { xpertId, projectId, threadId, title } of rows) {
        if (projectId && !readable.has(projectId)) {
            try {
                await projects.assertCanRead(projectId)
                readable.set(projectId, true)
            } catch (error) {
                if (!(error instanceof ForbiddenException)) throw error
                readable.set(projectId, false)
            }
        }
        if (projectId && !readable.get(projectId)) continue
        const threads = result.get(xpertId) ?? []
        threads.push({ threadId, title })
        result.set(xpertId, threads)
    }
    return result
}
