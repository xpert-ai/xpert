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
import { catchError, filter, map, Observable, of } from 'rxjs'
import { t } from 'i18next'
import { z } from 'zod/v3'
import type { SseMessageEvent } from '../shared/stream/redis-sse.service'
import { publicAppPlatformRuntimeError } from '../plugin-resource/app-platform/platform-error'
import { executionDuration } from '../shared/stream/execution-duration'

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
// App references are business UI. Inputs, results and HTML are loaded through
// the scoped MCP App endpoint, never through the diagnostic tool envelope.
const appPart = identity.extend({
    type: z.literal('component'),
    id: z.string(),
    data: z.object({
        type: z.literal('McpApp'),
        appInstanceId: z.string().min(1),
        appInstanceToken: optionalText,
        resourceUri: z.string().startsWith('ui://'),
        toolName: z.string().min(1),
        toolCallId: optionalText,
        toolsetId: optionalText,
        serverName: optionalText,
        executionId: optionalText,
        title: z.union([z.string(), z.record(z.string())]).optional(),
        status: z.enum(['running', 'success', 'fail']).optional(),
        created_date: date,
        end_date: date
    })
})
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
    elapsedTime: z.preprocess(executionDuration, z.number().optional()),
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
    const app = appPart.safeParse(value)
    if (app.success) return { ...app.data, data: { ...app.data.data, category: 'Dashboard' } }
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

export function runtimeStream(stream: Observable<SseMessageEvent>, restricted = usesRuntimePresentation()) {
    if (!restricted) return stream
    return stream.pipe(
        map((event) => {
            let payload: unknown = event.data
            if (typeof payload === 'string') {
                try {
                    payload = JSON.parse(payload)
                } catch {
                    return null
                }
            }
            const data = runtimeStreamPayload(payload)
            return data === null ? null : { ...event, data }
        }),
        filter((event): event is SseMessageEvent => event !== null),
        catchError((error) => of({ data: { type: 'event', event: 'on_error', data: runtimePresentationError(error) } }))
    )
}
