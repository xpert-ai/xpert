import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import { z } from 'zod'
import { getChatEventName, hasObjectData, serializeRunStreamPayload } from './run-stream-payload'
import type { IChatMessage } from '@xpert-ai/contracts'
import { runStreamSnapshotPayloadSchema, type RunStreamSnapshotPayload } from './run-stream-snapshot.schema'

/** Captures immutable state at an event boundary, before asynchronous persistence can observe later deltas. */
export class RunStreamSnapshotWriter {
    private readonly messages = new Map<string, Partial<IChatMessage>>()
    private readonly agentRuns = new Map<string, Map<string, z.output<typeof agentRunSchema>>>()
    private activeMessageId: string | null = null
    private pendingInterrupt: unknown = null
    private capturedAt = 0
    private flushRequested = false

    observe(message: Partial<IChatMessage> | null | undefined, event?: unknown) {
        if (!message?.id) return
        this.messages.set(message.id, message)
        this.activeMessageId = message.id
        const name = getChatEventName(event)
        this.flushRequested ||= name !== null && flushEvents.has(name)
        if (name === ChatMessageEventTypeEnum.ON_INTERRUPT && hasObjectData(event)) {
            // Keep the exact control payload, including task/interrupt/tool-call IDs, at this cursor.
            this.pendingInterrupt = event.data
        }
        if (name === ChatMessageEventTypeEnum.ON_AGENT_START || name === ChatMessageEventTypeEnum.ON_AGENT_END) {
            const payload = serializeRunStreamPayload(event)
            const parsed = agentRunSchema.safeParse(hasObjectData(payload) ? payload.data : null)
            if (parsed.success) {
                const runs = this.agentRuns.get(message.id) ?? new Map<string, z.output<typeof agentRunSchema>>()
                runs.set(parsed.data.id, { ...runs.get(parsed.data.id), ...parsed.data })
                this.agentRuns.set(message.id, runs)
            }
        }
    }

    capture(finished = false): RunStreamSnapshotPayload | null {
        if (!this.messages.size || (!finished && !this.flushRequested && Date.now() - this.capturedAt < 2000))
            return null
        const messages = [...this.messages.values()].map((message) => ({
            id: message.id,
            conversationId: message.conversationId,
            executionId: message.executionId,
            role: message.role,
            content: message.content ?? '',
            reasoning: message.reasoning,
            references: message.references,
            events: message.events,
            status: message.status,
            error: message.error,
            agentRuns: [...(this.agentRuns.get(message.id)?.values() ?? [])],
            createdAt: message.createdAt,
            updatedAt: message.updatedAt
        }))
        const payload = runStreamSnapshotPayloadSchema.parse(
            JSON.parse(
                JSON.stringify({
                    version: 1,
                    finished,
                    pendingInterrupt: this.pendingInterrupt,
                    activeMessageId: this.activeMessageId,
                    messages
                })
            )
        )
        this.capturedAt = Date.now()
        this.flushRequested = false
        return payload
    }
}

const agentRunSchema = z.object({ id: z.string() }).passthrough()

const flushEvents = new Set<string>([
    ChatMessageEventTypeEnum.ON_MESSAGE_END,
    ChatMessageEventTypeEnum.ON_TOOL_END,
    ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
    ChatMessageEventTypeEnum.ON_INTERRUPT
])
