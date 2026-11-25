import type { Repository } from 'typeorm'
import { ChatThreadPurpose } from '@xpert-ai/contracts'
import type { ChatConversationThread } from '../conversation-thread.entity'

/** Compare title ownership in SQL so a late model result cannot overwrite a manual rename. */
export async function saveSideChatTitle(
    repository: Repository<ChatConversationThread>,
    thread: ChatConversationThread,
    title: string,
    source: 'default' | 'generated'
): Promise<boolean> {
    const value = title.trim().slice(0, 200)
    if (!value || thread.metadata.purpose !== ChatThreadPurpose.SideChat || thread.metadata.titleSource !== 'default')
        return false
    const query = repository
        .createQueryBuilder()
        .update()
        .set({
            metadata: () =>
                `COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('title', CAST(:title AS text), 'titleSource', CAST(:titleSource AS text))`
        })
        .where({ id: thread.id, conversationId: thread.conversationId, tenantId: thread.tenantId })
        .andWhere("metadata ->> 'titleSource' = 'default'")
        .setParameters({ title: value, titleSource: source })
    if (source === 'default') query.andWhere("COALESCE(metadata ->> 'title', '') = ''")
    return (await query.execute()).affected === 1
}
