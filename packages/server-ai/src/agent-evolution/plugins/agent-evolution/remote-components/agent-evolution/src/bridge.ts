import type { EvolutionViewData, SimulationActionResult } from './types'

export const CHANNEL = 'xpertai.remote_component'
export const PROTOCOL_VERSION = 1

type PendingRequest = {
    resolve: (value: EvolutionViewData | SimulationActionResult) => void
    reject: (error: Error) => void
}

export type InitMessage = {
    channel: typeof CHANNEL
    protocolVersion: typeof PROTOCOL_VERSION
    type: 'init'
    instanceId?: string
    locale?: string
    theme?: { tokens?: { [key: string]: string | number } }
    parameters?: { tab?: string }
}

type HostResponseMessage = {
    channel: typeof CHANNEL
    protocolVersion: typeof PROTOCOL_VERSION
    type: 'data' | 'actionResult' | 'error'
    requestId?: string
    data?: EvolutionViewData
    result?: SimulationActionResult
    message?: string
}

const pending = new Map<string, PendingRequest>()
let instanceId: string | null = null

export function isInitMessage(value: unknown): value is InitMessage {
    return (
        typeof value === 'object' &&
        value !== null &&
        'channel' in value &&
        value.channel === CHANNEL &&
        'protocolVersion' in value &&
        value.protocolVersion === PROTOCOL_VERSION &&
        'type' in value &&
        value.type === 'init'
    )
}

function isHostResponse(value: unknown): value is HostResponseMessage {
    return (
        typeof value === 'object' &&
        value !== null &&
        'channel' in value &&
        value.channel === CHANNEL &&
        'protocolVersion' in value &&
        value.protocolVersion === PROTOCOL_VERSION &&
        'type' in value &&
        (value.type === 'data' || value.type === 'actionResult' || value.type === 'error')
    )
}

export function setInstanceId(value?: string) {
    instanceId = value ?? null
}

export function resolveHostResponse(value: unknown) {
    if (!isHostResponse(value) || typeof value.requestId !== 'string') {
        return false
    }
    const request = pending.get(value.requestId)
    if (!request) {
        return false
    }
    pending.delete(value.requestId)
    if (value.type === 'error') {
        request.reject(new Error(value.message ?? 'Remote request failed'))
    } else {
        request.resolve(value.data ?? value.result ?? {})
    }
    return true
}

export function requestData(): Promise<EvolutionViewData> {
    return requestHost<EvolutionViewData>('requestData', { query: { page: 1, pageSize: 1, parameters: {} } })
}

export function runSimulation(): Promise<SimulationActionResult> {
    return requestHost<SimulationActionResult>('executeAction', {
        actionKey: 'run_conformance_simulation',
        input: {},
        parameters: {}
    })
}

export function notify(message: string, level: 'success' | 'error') {
    send('notify', { message, level })
}

export function applyTheme(theme?: InitMessage['theme']) {
    if (!theme?.tokens) return
    for (const [key, value] of Object.entries(theme.tokens)) {
        document.documentElement.style.setProperty(`--xui-${kebab(key)}`, String(value))
    }
}

function requestHost<T extends EvolutionViewData | SimulationActionResult>(
    type: string,
    body: { [key: string]: unknown }
): Promise<T> {
    const requestId = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
        pending.set(requestId, {
            resolve: (value) => resolve(value as T),
            reject
        })
        send(type, { requestId, ...body })
        window.setTimeout(() => {
            if (!pending.has(requestId)) return
            pending.delete(requestId)
            reject(new Error(`${type} request timed out`))
        }, 30000)
    })
}

function send(type: string, body: { [key: string]: unknown }) {
    window.parent?.postMessage({ channel: CHANNEL, protocolVersion: PROTOCOL_VERSION, instanceId, type, ...body }, '*')
}

function kebab(value: string) {
    return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}
