import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    type TMessageContentComplex,
    type TMessageContentWidget
} from '@xpert-ai/contracts'
import type { MessageWidgetReference } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const referenceSchema = z.object({
    messageId: z.string().uuid(),
    widgetId: z.string().min(1),
    threadId: z.string().min(1),
    provider: z.string().min(1)
})
const publishedSchema = z.object({
    type: z.literal(ChatMessageTypeEnum.EVENT),
    event: z.literal(ChatMessageEventTypeEnum.ON_CHAT_EVENT),
    data: z.object({ type: z.literal('message_widget_published'), reference: referenceSchema })
})
const deltaSchema = z.object({
    type: z.literal(ChatMessageTypeEnum.MESSAGE),
    widgetReference: referenceSchema
})

/** Emit only after the reference transaction commits. Viewers resolve their own authorized card. */
export async function emitMessageWidget(reference: MessageWidgetReference) {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, { type: 'message_widget_published', reference })
}

export function messageWidgetPlaceholder(reference: MessageWidgetReference): TMessageContentWidget {
    return { id: reference.widgetId, type: 'component', data: { type: 'Widget', category: 'Dashboard', widgets: [] } }
}

export function bindMessageWidgetEvent(
    value: unknown,
    owner: { messageId: string; threadId: string; executionId: string }
) {
    const parsed = publishedSchema.safeParse(value)
    if (!parsed.success) return null
    const reference = parsed.data.data.reference as MessageWidgetReference
    if (reference.messageId !== owner.messageId || reference.threadId !== owner.threadId) return null
    return {
        type: ChatMessageTypeEnum.MESSAGE,
        widgetReference: reference,
        data: { ...messageWidgetPlaceholder(reference), messageId: owner.messageId, executionId: owner.executionId }
    }
}

export function readMessageWidgetDelta(value: unknown): MessageWidgetReference | undefined {
    const parsed = deltaSchema.safeParse(value)
    return parsed.success ? (parsed.data.widgetReference as MessageWidgetReference) : undefined
}

/** A Widget creates a text boundary; replaying or updating that Widget must not create another one. */
export class MessageWidgetTextSegments {
    private messageId: string
    private boundary?: string
    private readonly widgets = new Set<string>()

    insert(reference: MessageWidgetReference) {
        this.forMessage(reference.messageId)
        if (!this.widgets.has(reference.widgetId)) {
            this.widgets.add(reference.widgetId)
            this.boundary = reference.widgetId
        }
    }

    text(content: string | TMessageContentComplex, messageId: string): string | TMessageContentComplex {
        this.forMessage(messageId)
        if (!this.boundary || (typeof content !== 'string' && content.type !== 'text')) return content
        const text = typeof content === 'string' ? { type: 'text' as const, text: content } : content
        return { ...text, id: `widget-text:${JSON.stringify([text.id ?? messageId, this.boundary])}` }
    }

    private forMessage(messageId: string) {
        if (this.messageId === messageId) return
        this.messageId = messageId
        this.boundary = undefined
        this.widgets.clear()
    }
}
