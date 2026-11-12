import { concatMap, Observable } from 'rxjs'
import { z } from 'zod'
import type { ChatGroupDisplay } from '@xpert-ai/contracts'
import { groupDisplayBlock, groupDisplayCandidate } from './group-display'

const start = z.object({
    type: z.literal('event'),
    event: z.literal('on_message_start'),
    data: z.object({ id: z.string().uuid(), role: z.literal('ai') })
})
const component = z.object({ id: z.string(), data: z.record(z.unknown()) })
const envelope = z.union([
    z.object({ type: z.literal('message'), data: z.unknown() }),
    z.object({ type: z.literal('event'), event: z.literal('on_tool_message'), data: z.unknown() })
])

/** Capture display updates at the producer, before callbacks; text/tool activity never incurs a publication. */
export function projectGroupDisplayStream(
    source: Observable<MessageEvent>,
    publish: (messageId: string, display: ChatGroupDisplay[]) => Promise<void>,
    failed: () => void
): Observable<MessageEvent> {
    let messageId: string | undefined
    const blocks = new Map<string, ChatGroupDisplay>()
    const kinds = new Map<string, 'Widget' | 'McpApp'>()
    return source.pipe(
        concatMap(async (event) => {
            const beginning = start.safeParse(event.data)
            if (beginning.success) {
                messageId = beginning.data.data.id
                blocks.clear()
                kinds.clear()
            }
            if (!messageId) return event
            const parsed = envelope.safeParse(event.data)
            if (!parsed.success) return event
            let candidate = groupDisplayCandidate(parsed.data.data)
            const update = component.safeParse(candidate)
            if (update.success) {
                const type = update.data.data.type
                if ((type === 'Widget' || type === 'McpApp') && (kinds.has(update.data.id) || kinds.size < 32))
                    kinds.set(update.data.id, type)
                const previous = blocks.get(update.data.id)
                candidate = {
                    type: 'component',
                    id: update.data.id,
                    data: { type: kinds.get(update.data.id), ...previous?.data, ...update.data.data }
                }
                // Resource cards are already complete typed blocks and must retain their own discriminator.
                if (
                    parsed.data.data &&
                    typeof parsed.data.data === 'object' &&
                    'type' in parsed.data.data &&
                    parsed.data.data.type === 'resource_card'
                )
                    candidate = parsed.data.data
            }
            const block = groupDisplayBlock(candidate)
            if (
                !block ||
                (!blocks.has(block.id) && blocks.size >= 32) ||
                JSON.stringify(blocks.get(block.id)) === JSON.stringify(block)
            )
                return event
            blocks.set(block.id, block)
            try {
                await publish(messageId, [...blocks.values()])
            } catch {
                failed()
            } // Terminal reconciliation retries from persisted runtime output, without re-running tools.
            return event
        })
    )
}
