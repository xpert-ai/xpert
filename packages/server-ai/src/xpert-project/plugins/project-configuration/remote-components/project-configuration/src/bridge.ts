import { viewContextEventSchema } from '@xpert-ai/contracts'
import { z } from 'zod'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'

const envelope = z.object({
    channel: z.literal('xpertai.remote_component'),
    type: z.string(),
    scopeRevision: z.number().int().nonnegative().optional(),
    event: z.unknown().optional(),
    instanceId: z.string().nullish(),
    requestId: z.string().optional(),
    data: z.unknown().optional(),
    result: z.unknown().optional(),
    message: z.string().optional(),
    locale: z.string().optional(),
    initialQuery: z.object({ selectionId: z.string().optional() }).optional(),
    theme: z
        .object({
            mode: z.string().optional(),
            density: z.enum(['default', 'compact']).optional(),
            tokens: z.record(z.union([z.string(), z.number()])).optional()
        })
        .optional(),
    debug: z.object({ enabled: z.boolean().optional() }).optional()
})
let instanceId: string | null = null
let scopeRevision: number | undefined
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }>()
function send(type: string, body: object = {}) {
    window.parent.postMessage(
        { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, scopeRevision, type, ...body },
        '*'
    )
}
export function connect(init: (locale: string, changed: boolean) => void, contextChanged: () => void) {
    const receive = (event: MessageEvent<unknown>) => {
        if (event.source !== window.parent) return
        const parsed = envelope.safeParse(event.data)
        if (!parsed.success) return
        const message = parsed.data
        if (message.type === 'init' && message.instanceId) {
            const changed = instanceId !== message.instanceId || scopeRevision !== message.scopeRevision
            scopeRevision = message.scopeRevision
            instanceId = message.instanceId
            for (const [key, value] of Object.entries(message.theme?.tokens ?? {}))
                document.documentElement.style.setProperty(
                    `--xui-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
                    String(value)
                )
            installShadcnThemeVars({ density: message.theme?.density ?? 'compact' })
            document.documentElement.classList.toggle('dark', message.theme?.mode === 'dark')
            document.documentElement.lang = message.locale ?? 'en-US'
            if (changed) invalidate()
            init(message.locale ?? 'en-US', changed)
            return
        }
        if (message.instanceId === instanceId && message.type === 'hostEvent') {
            const context = viewContextEventSchema.safeParse(message.event)
            if (context.success && context.data.data.revision > (scopeRevision ?? -1)) {
                scopeRevision = context.data.data.revision
                invalidate()
                contextChanged()
            }
            return
        }
        if (!instanceId || message.instanceId !== instanceId || !message.requestId) return
        const call = pending.get(message.requestId)
        if (!call) return
        pending.delete(message.requestId)
        window.clearTimeout(call.timer)
        if (message.type === 'error') call.reject(Error(message.message ?? 'Request failed'))
        else call.resolve(message.data ?? message.result)
    }
    window.addEventListener('message', receive)
    send('ready')
    return () => {
        window.removeEventListener('message', receive)
        pending.forEach((call) => {
            window.clearTimeout(call.timer)
            call.reject(Error('View closed'))
        })
        pending.clear()
    }
}
export function request(type: string, body: object = {}): Promise<unknown> {
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(
            () => {
                pending.delete(requestId)
                reject(Error('Request timed out'))
            },
            30000
        )
        pending.set(requestId, { resolve, reject, timer })
        send(type, { ...body, requestId })
    })
}

function invalidate() {
    pending.forEach((call) => {
        window.clearTimeout(call.timer)
        call.reject(Error('Project context changed'))
    })
    pending.clear()
}

/** Pin asynchronous file preparation to the project that started it. */
export function scopedRequest() {
    const instance = instanceId, revision = scopeRevision
    return (type: string, body: object = {}) => {
        if (instance !== instanceId || revision !== scopeRevision) return Promise.reject(Error('Project context changed'))
        return request(type, body)
    }
}
