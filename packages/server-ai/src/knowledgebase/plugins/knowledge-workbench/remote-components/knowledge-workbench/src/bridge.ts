import { z } from 'zod/v3'
import type { DocumentRow, ViewData } from './types'
import { viewContextEventSchema } from '../../../../../../view-extension/remote-context'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'
import { setLocale } from './i18n'

export const CHANNEL = 'xpertai.remote_component'
export const PROTOCOL_VERSION = 1
const hostMessageSchema = z.object({
    channel: z.literal(CHANNEL),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    type: z.string(),
    instanceId: z.string().nullish(),
    scopeRevision: z.number().int().nonnegative().optional(),
    requestId: z.string().optional(),
    locale: z.string().optional(),
    theme: z.unknown(),
    data: z.unknown(),
    result: z.unknown(),
    event: z.unknown(),
    message: z.string().optional(),
    initialQuery: z
        .object({ parameters: z.record(z.unknown()).optional() })
        .passthrough()
        .optional()
})
const CONTEXT_KEY = 'knowledgebase_workbench'

type BridgeRequest = {
    requestId: string
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

const pendingRequests = new Map<string, BridgeRequest>()
let instanceId: string | null = null
let scopeRevision: number | undefined

export function setInstanceId(value: string | null) {
    instanceId = value
}

export function sendToHost(type: string, body: Record<string, unknown> = {}) {
    window.parent?.postMessage(
        {
            channel: CHANNEL,
            protocolVersion: PROTOCOL_VERSION,
            instanceId,
            scopeRevision,
            type,
            ...body
        },
        '*'
    )
}

function requestHost<T>(type: string, body: Record<string, unknown>, responseType: string): Promise<T> {
    const requestId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`

    return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { requestId, resolve, reject })
        sendToHost(type, { requestId, ...body })
        window.setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId)
                reject(new Error(`${responseType} request timed out`))
            }
        }, 30000)
    })
}

export function resolveHostResponse(message: any) {
    const requestId = typeof message.requestId === 'string' ? message.requestId : ''
    const pending = pendingRequests.get(requestId)
    if (!pending) {
        return false
    }
    if (message.type === 'error') {
        pendingRequests.delete(requestId)
        pending.reject(new Error(message.message || 'Remote request failed'))
        return true
    }
    if (
        ['data', 'actionResult', 'fileActionResult', 'clientCommandResult', 'parameterOptions'].includes(message.type)
    ) {
        pendingRequests.delete(requestId)
        pending.resolve(message.data ?? message.result)
        return true
    }
    return false
}

export function requestData(query: Record<string, unknown>) {
    return requestHost<ViewData>('requestData', { query }, 'data')
}

export function executeAction(
    actionKey: string,
    input?: Record<string, unknown>,
    parameters?: Record<string, unknown>
) {
    return requestHost<{ success?: boolean; message?: unknown; data?: unknown }>(
        'executeAction',
        { actionKey, input, parameters },
        'actionResult'
    )
}

export function executeFileAction(
    actionKey: string,
    file: File,
    input?: Record<string, unknown>,
    parameters?: Record<string, unknown>
) {
    const revision = scopeRevision
    return file.arrayBuffer().then((buffer) => {
        if (revision !== scopeRevision) throw new Error('View context changed')
        return requestHost<{ success?: boolean; message?: unknown; data?: unknown }>(
            'executeFileAction',
            {
                actionKey,
                input,
                parameters,
                file: {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    buffer
                }
            },
            'fileActionResult'
        )
    })
}

export function invokeClientCommand(commandKey: string, payload: Record<string, unknown>) {
    return requestHost('invokeClientCommand', { commandKey, payload }, 'clientCommandResult')
}

export function notify(message: string, level: 'success' | 'error' = 'success') {
    sendToHost('notify', { message, level })
}

export function applyTheme(theme: any) {
    if (!theme?.tokens) {
        return
    }
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.tokens)) {
        root.style.setProperty(`--xui-${kebab(key)}`, String(value))
    }
}

export async function syncAssistantContext(knowledgebaseId: string, rows: DocumentRow[]) {
    if (!knowledgebaseId) {
        return
    }
    await invokeClientCommand('assistant.context.set', {
        key: CONTEXT_KEY,
        context: {
            knowledgebaseId,
            documentIds: rows.map((row) => row.id),
            documents: rows.map((row) => ({
                id: row.id,
                name: row.name,
                path: row.folder || row.filePath || undefined
            }))
        }
    }).catch(() => undefined)
}

function kebab(value: string) {
    return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

/** The View chooses to reset its data and selection when its host scope changes. */
export function connectHost(
    init: (query?: { parameters?: Record<string, unknown> }) => void,
    hostEvent: (event: unknown) => void,
    contextChanged: () => void
) {
    const receive = (event: MessageEvent<unknown>) => {
        if (event.source !== window.parent) return
        const parsed = hostMessageSchema.safeParse(event.data)
        if (!parsed.success) return
        const message = parsed.data
        if (message.type === 'init' && typeof message.instanceId === 'string') {
            setInstanceId(message.instanceId)
            scopeRevision = message.scopeRevision
            setLocale(message.locale)
            applyTheme(message.theme)
            installShadcnThemeVars({ density: 'compact' })
            init(message.initialQuery)
            return
        }
        if (!instanceId || message.instanceId !== instanceId) return
        if (message.type === 'hostEvent') {
            const context = viewContextEventSchema.safeParse(message.event)
            if (context.success) {
                if (context.data.data.revision > (scopeRevision ?? -1)) {
                    scopeRevision = context.data.data.revision
                    contextChanged()
                }
            } else hostEvent(message.event)
        } else resolveHostResponse(message)
    }
    window.addEventListener('message', receive)
    sendToHost('ready')
    return () => {
        window.removeEventListener('message', receive)
    }
}
export function clearPendingRequests() {
    for (const call of pendingRequests.values()) call.reject(new Error('View context changed'))
    pendingRequests.clear()
}
