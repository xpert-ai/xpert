import type { DocumentRow, ViewData } from './types'

export const CHANNEL = 'xpertai.remote_component'
export const PROTOCOL_VERSION = 1
const CONTEXT_KEY = 'knowledgebase_workbench'

type BridgeRequest = {
    requestId: string
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

const pendingRequests = new Map<string, BridgeRequest>()
let instanceId: string | null = null

export function setInstanceId(value: string | null) {
    instanceId = value
}

export function sendToHost(type: string, body: Record<string, unknown> = {}) {
    window.parent?.postMessage(
        {
            channel: CHANNEL,
            protocolVersion: PROTOCOL_VERSION,
            instanceId,
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
    return file.arrayBuffer().then((buffer) =>
        requestHost<{ success?: boolean; message?: unknown; data?: unknown }>(
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
    )
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
