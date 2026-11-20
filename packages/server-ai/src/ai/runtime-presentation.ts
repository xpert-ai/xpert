import type { ResolvedMessageWidget } from '../chat-message/widgets/message-widgets'
import { readMessageWidgetDelta } from '../chat-message/widgets/message-widget-stream'
import { runDisplaySnapshotSchema } from '../shared/stream/display-snapshot/display-snapshot.schema'
import { assistantRuntimeCredential } from '@xpert-ai/server-core'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import {
    IChatMessage,
    TMessageContentComponent,
    TMessageContentComplex,
    parseResourceCardContent
} from '@xpert-ai/contracts'
import { parseFileActivityContent } from '@xpert-ai/chatkit-types'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { catchError, concatMap, defer, Observable, of } from 'rxjs'
import { t } from 'i18next'
import { z } from 'zod/v3'
import type { SseMessageEvent } from '../shared/stream/redis-sse.service'
import { publicAppPlatformRuntimeError } from '../plugin-resource/app-platform/platform-error'

const optionalText = z.string().optional()
const date = z.union([z.string(), z.date()]).optional()
const identity = z.object({
    id: optionalText,
    executionId: optionalText,
    parentExecutionId: optionalText,
    runId: optionalText,
    messageId: optionalText,
    created_date: date
})
const textPart = identity.extend({ type: z.literal('text'), text: z.string() })
const lifecycle = z.object({
    id: optionalText,
    conversationId: optionalText,
    threadId: optionalText,
    parentId: optionalText.nullable(),
    executionId: optionalText,
    xpertId: optionalText,
    title: optionalText,
    role: optionalText,
    status: optionalText,
    error: z.unknown().optional(),
    elapsedTime: z.number().optional(),
    createdAt: date,
    updatedAt: date
})
const envelope = z.object({ type: z.string(), event: optionalText, data: z.unknown().optional() })

export function usesRuntimePresentation() {
    return (
        !!assistantRuntimeCredential(RequestContext.currentUser()) ||
        !RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW)
    )
}

export function runtimePresentationError(error?: unknown) {
    return (
        publicAppPlatformRuntimeError(error) ??
        t('server-ai:Error.ApplicationRuntimeFailed', {
            defaultValue: 'The task could not be completed. Please try again or contact support.'
        })
    )
}

export function runtimeContentPart(value: unknown): TMessageContentComplex | null {
    const part = value as TMessageContentComponent<{ toolPresentation?: string }> | undefined
    if (
        part?.type === 'component' &&
        typeof part.id === 'string' &&
        part.data?.category === 'Tool' &&
        part.data.toolPresentation === 'redacted'
    )
        return part
    const text = textPart.safeParse(value)
    if (text.success) return text.data
    const file = parseFileActivityContent(value)
    if (file) {
        const { agentKey: _agentKey, ...receipt } = file
        if (receipt.data.kind === 'delivery' && receipt.data.status === 'error')
            return { ...receipt, data: { ...receipt.data, error: runtimePresentationError(receipt.data.error) } }
        return receipt
    }
    const resource = parseResourceCardContent(value)
    if (resource) return resource
    // Reasoning, private widgets and diagnostics are not business output.
    return null
}

export function runtimeMessageContent(content: IChatMessage['content']): IChatMessage['content'] {
    return typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map(runtimeContentPart).filter((part): part is TMessageContentComplex => part !== null)
          : content
}

export function runtimeStreamPayload(value: unknown): unknown | null {
    const parsed = envelope.safeParse(value)
    if (!parsed.success) return null
    const payload = parsed.data
    if (['stream_start', 'complete'].includes(payload.type)) return { type: payload.type }
    if (payload.type === 'stream_resync') return { type: 'stream_resync' }
    if (payload.type === 'message') {
        const data = typeof payload.data === 'string' ? payload.data : runtimeContentPart(payload.data)
        return data === null ? null : { type: 'message', data }
    }
    if (payload.type !== 'event') return null
    if (payload.event === 'on_error')
        return { type: 'event', event: payload.event, data: runtimePresentationError(payload.data) }
    if (
        ![
            'on_conversation_start',
            'on_conversation_end',
            'on_message_start',
            'on_message_end',
            'on_agent_start',
            'on_agent_end'
        ].includes(payload.event)
    )
        return null
    const data = lifecycle.safeParse(payload.data)
    if (!data.success) return null
    const { error, ...fields } = data.data
    return {
        type: 'event',
        event: payload.event,
        data: { ...fields, ...(fields.status === 'error' ? { error: runtimePresentationError(error) } : {}) }
    }
}

export function appendMessageWidgets(
    content: IChatMessage['content'],
    messageId: string,
    cards: ResolvedMessageWidget[],
    restricted = false
) {
    const widgets = cards.filter((card) => card.messageId === messageId).map((card) => card.widget)
    if (!widgets.length) return restricted ? runtimeMessageContent(content) : content
    const remaining = new Map(widgets.map((widget) => [widget.id, widget]))
    const source = Array.isArray(content) ? content : content ? [{ type: 'text' as const, text: content }] : []
    const parts: TMessageContentComplex[] = []
    const restored = new Set<string>()
    for (const part of source) {
        if (part.type === 'component' && part.data?.type === 'Widget' && remaining.has(part.id)) {
            if (!restored.has(part.id)) parts.push(remaining.get(part.id))
            restored.add(part.id)
        } else {
            const visible = restricted ? runtimeContentPart(part) : part
            if (visible) parts.push(visible)
        }
    }
    return [...parts, ...widgets.filter((widget) => !restored.has(widget.id))]
}

type ResolveMessageWidget = (ids: string[]) => Promise<ResolvedMessageWidget[]>

const messageEnd = z.object({
    type: z.literal('event'),
    event: z.literal('on_message_end'),
    data: z.object({ id: z.string().uuid(), content: z.unknown(), role: z.literal('ai').optional() })
})

/** Restore issued Widgets at their saved positions under the viewer's presentation policy. */
export function runtimeStream(
    stream: Observable<SseMessageEvent>,
    restricted = usesRuntimePresentation(),
    resolveWidget?: ResolveMessageWidget
) {
    if (!restricted && !resolveWidget) return stream
    const presented = stream.pipe(
        concatMap((event) => {
            let payload = event.data
            if (typeof payload === 'string') {
                try {
                    payload = JSON.parse(payload)
                } catch {
                    return restricted ? [] : of(event)
                }
            }
            if (
                !restricted &&
                resolveWidget &&
                payload &&
                typeof payload === 'object' &&
                'type' in payload &&
                payload.type === 'stream_snapshot' &&
                'snapshot' in payload
            ) {
                const snapshot = runDisplaySnapshotSchema.safeParse(payload.snapshot)
                if (snapshot.success) {
                    return defer(() => resolveWidget(snapshot.data.messages.map((message) => message.id))).pipe(
                        concatMap((cards) =>
                            of({
                                ...event,
                                data: {
                                    ...payload,
                                    snapshot: {
                                        ...snapshot.data,
                                        messages: snapshot.data.messages.map((message) => ({
                                            ...message,
                                            content: appendMessageWidgets(message.content, message.id, cards)
                                        }))
                                    }
                                }
                            })
                        )
                    )
                }
            }
            const reference = readMessageWidgetDelta(payload)
            if (reference && resolveWidget) {
                return defer(() => resolveWidget([reference.messageId])).pipe(
                    concatMap((cards) => {
                        const card = cards.find(
                            (card) => card.messageId === reference.messageId && card.widget.id === reference.widgetId
                        )
                        return card
                            ? of({
                                  ...event,
                                  data: { type: 'message', data: { ...card.widget, messageId: reference.messageId } }
                              })
                            : []
                    })
                )
            }
            const visible = restricted ? runtimeStreamPayload(payload) : payload
            if (visible === null) return []
            const output = restricted ? { ...event, data: visible } : event
            if (
                !resolveWidget ||
                typeof payload !== 'object' ||
                !payload ||
                !('event' in payload) ||
                payload.event !== 'on_message_end'
            )
                return of(output)
            const end = messageEnd.safeParse(payload)
            if (!end.success || typeof visible !== 'object' || !('data' in visible)) return of(output)
            const { id, content } = end.data.data
            return defer(() => resolveWidget([id])).pipe(
                concatMap((cards) => {
                    if (!cards.some((card) => card.messageId === id)) return of(output)
                    // Redis end events contain lifecycle fields only; never replace streamed text with just the cards.
                    if (content === undefined)
                        return of(
                            ...cards
                                .filter((card) => card.messageId === id)
                                .map((card) => ({
                                    data: { type: 'message', data: { ...card.widget, messageId: id } }
                                })),
                            output
                        )
                    const source = content as IChatMessage['content']
                    return of({
                        ...event,
                        data: {
                            ...visible,
                            data: {
                                ...(visible.data as object),
                                content: appendMessageWidgets(source, id, cards, restricted)
                            }
                        }
                    })
                })
            )
        })
    )
    return restricted
        ? presented.pipe(
              catchError((error) =>
                  of({ data: { type: 'event', event: 'on_error', data: runtimePresentationError(error) } })
              )
          )
        : presented
}
