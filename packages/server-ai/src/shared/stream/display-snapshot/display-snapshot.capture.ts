// Project only emitted events. Business messages may already be ahead of an async delivery boundary.
// Reuse the message reducers, but own all inputs so later mutations cannot change queued events or snapshots.
import {
    appendMessageContent,
    createMessageAppendContextTracker,
    IChatMessage,
    TChatAgentRunSummary,
    TChatMessageStep,
    TMessageContentComplex,
    TRunDisplayMessage
} from '@xpert-ai/contracts'
import z from 'zod'
import {
    appendMessageSteps,
    sanitizeMessageContentForPersistence
} from '../../../chat-message/message-step-persistence'

const agentSchema = z.object({
    id: z.string(),
    parentId: z.string().optional(),
    agentKey: z.string().optional(),
    xpertId: z.string().optional(),
    xpertName: z.string().optional(),
    title: z.string().optional(),
    status: z.string().optional(),
    error: z.string().optional(),
    elapsedTime: z.number().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional()
})
const agentEventSchema = z.object({
    type: z.literal('event'),
    event: z.enum(['on_agent_start', 'on_agent_end']),
    data: agentSchema
})
const lifecycleSchema = z.object({
    type: z.literal('event'),
    event: z.enum(['on_message_start', 'on_message_end']),
    data: z.object({
        id: z.string(),
        role: z.string().optional(),
        executionId: z.string().optional(),
        conversationId: z.string().nullish(),
        content: z
            .custom<
                IChatMessage['content']
            >((value) => value === undefined || typeof value === 'string' || Array.isArray(value))
            .optional(),
        reasoning: z
            .custom<IChatMessage['reasoning']>((value) => value === undefined || Array.isArray(value))
            .optional(),
        events: z.custom<IChatMessage['events']>((value) => value === undefined || Array.isArray(value)).optional(),
        status: z
            .custom<IChatMessage['status']>((value) => value === undefined || typeof value === 'string')
            .optional(),
        error: z.string().nullish()
    })
})
const deltaSchema = z.object({
    type: z.literal('message'),
    data: z.union([
        z.string(),
        z.custom<TMessageContentComplex>((value) => value !== null && typeof value === 'object')
    ])
})
const stepSchema = z.object({
    type: z.literal('event'),
    event: z.literal('on_tool_message'),
    data: z.custom<TChatMessageStep>((value) => value !== null && typeof value === 'object')
})

export interface FrozenDisplay {
    activeMessageId: string
    messages: TRunDisplayMessage[]
}

export class DisplaySnapshotCapture {
    private readonly messages = new Map<string, IChatMessage>()
    private readonly agents = new Map<string, Map<string, TChatAgentRunSummary>>()
    private readonly appendContext = createMessageAppendContextTracker()
    private activeMessageId: string | null = null
    private lastCapture = 0

    capture(event: unknown): FrozenDisplay | null {
        const lifecycle = lifecycleSchema.safeParse(event)
        if (lifecycle.success) {
            const { data, event: name } = lifecycle.data
            if (name === 'on_message_start' && (!data.role || data.role === 'ai' || data.role === 'assistant')) {
                this.activeMessageId = data.id
                this.appendContext.reset()
                this.messages.set(data.id, {
                    ...JSON.parse(JSON.stringify(data)),
                    role: 'ai',
                    content: cloneContent(data.content ?? '')
                })
            } else if (name === 'on_message_end') {
                const message = this.messages.get(data.id)
                if (message) {
                    message.status = data.status ?? message.status
                    message.error = data.error
                }
            }
        }
        const message = this.activeMessageId ? this.messages.get(this.activeMessageId) : null
        if (!message) return null
        const delta = deltaSchema.safeParse(event)
        if (delta.success) {
            const incoming = cloneContent(delta.data.data)
            const { messageContext } = this.appendContext.resolve({
                incoming,
                fallbackSource: typeof incoming === 'string' ? 'memory_reply' : undefined,
                fallbackStreamId: message.id
            })
            appendMessageContent(message, incoming, messageContext)
        }
        const step = stepSchema.safeParse(event)
        if (step.success) appendMessageSteps(message, [cloneContent(step.data.data)])
        const agent = agentEventSchema.safeParse(event)
        if (agent.success) {
            let runs = this.agents.get(message.id)
            if (!runs) this.agents.set(message.id, (runs = new Map()))
            const value = agent.data.data
            runs.set(value.id, { ...runs.get(value.id), ...value })
        }
        const isText =
            delta.success &&
            (typeof delta.data.data === 'string' || ['text', 'reasoning'].includes(delta.data.data.type))
        if (isText && Date.now() - this.lastCapture < 1000) return null
        this.lastCapture = Date.now()
        const result: FrozenDisplay = {
            activeMessageId: message.id,
            messages: [...this.messages.values()].map((item) => ({
                id: item.id,
                role: 'ai',
                executionId: item.executionId,
                conversationId: item.conversationId,
                content: item.content,
                reasoning: item.reasoning,
                events: item.events,
                status: item.status,
                error: item.error,
                agentRuns: [...(this.agents.get(item.id)?.values() ?? [])]
            }))
        }
        const serialized = JSON.stringify(result)
        // Keep the previous durable snapshot and bounded tail on overflow; never silently truncate display state.
        return Buffer.byteLength(serialized) <= 2 * 1024 * 1024 ? JSON.parse(serialized) : null
    }
}

function cloneContent<T>(content: T): T {
    return JSON.parse(JSON.stringify(sanitizeMessageContentForPersistence(content)))
}
