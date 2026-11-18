// Invariants: each predicate owns a bounded, stable-key cursor.
// Failed and unresolved candidates advance the cursor; wrapping revisits older rows.
// Replicas may scan the same row; business transitions retain their locks and ownership fences.
import type { SelectQueryBuilder } from 'typeorm'
import type { ChatConversationThread } from './conversation-thread.entity'

export class ThreadMaintenanceScan {
    private cursor: string | undefined

    async run(
        query: SelectQueryBuilder<ChatConversationThread>,
        visit: (thread: ChatConversationThread) => Promise<unknown>,
        failed: (thread?: ChatConversationThread) => void,
        stopping: () => boolean
    ) {
        try {
            if (this.cursor) query.andWhere('thread.id > :scanCursor', { scanCursor: this.cursor })
            const rows = await query.orderBy('thread.id', 'ASC').take(50).getMany()
            // Advance before visiting: a failing candidate must not pin either scan.
            this.cursor = rows.length === 50 ? rows[rows.length - 1].id : undefined
            for (const thread of rows) {
                if (stopping()) break
                try {
                    await visit(thread)
                } catch {
                    failed(thread)
                }
            }
        } catch {
            failed()
        }
    }
}
