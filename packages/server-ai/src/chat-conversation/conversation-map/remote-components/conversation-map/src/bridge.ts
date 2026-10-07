import { z } from 'zod'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'
import { mapPageSchema, type MapAction, type MapPage, type MapQuery } from '../../../schema'
import { configureDebug, debug } from './debug'
const hostSchema = z.object({
    channel: z.literal('xpertai.remote_component'),
    type: z.string(),
    instanceId: z.string().nullish(),
    scopeRevision: z.number().optional(),
    requestId: z.string().optional(),
    data: z.unknown().optional(),
    result: z.unknown().optional(),
    message: z.string().optional(),
    locale: z.string().optional(),
    initialQuery: z.unknown().optional(),
    event: z.unknown().optional(),
    debug: z.object({ enabled: z.boolean() }).optional(),
    theme: z
        .object({
            mode: z.string().optional(),
            density: z.enum(['default', 'compact']).optional(),
            tokens: z.record(z.union([z.string(), z.number()]))
        })
        .optional()
})
export const prefsSchema = z.object({
    projectId: z.string().nullable().optional(),
    search: z.string().max(200).optional(),
    mode: z.enum(['tree', 'graph', 'list']).default('tree'),
    direction: z.enum(['TB', 'LR']).default('TB'),
    style: z.enum(['compact', 'summary']).default('compact'),
    showHistory: z.boolean().default(false),
    showShared: z.boolean().default(false)
})
export type Prefs = z.infer<typeof prefsSchema>
export const navigationSchema = z.object({
    target: z.literal('assistant.conversation'),
    conversationId: z.string(),
    threadId: z.string(),
    messageId: z.string().optional(),
    xpertId: z.string(),
    projectId: z.string().nullable(),
    preserveView: z.boolean(),
    viewKey: z.string()
})
export type Navigation = z.infer<typeof navigationSchema>
let instanceId: string | null = null,
    revision = 0
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }>()
export function send(type: string, body: object = {}) {
    window.parent.postMessage(
        { channel: 'xpertai.remote_component', protocolVersion: 1, type, instanceId, scopeRevision: revision, ...body },
        '*'
    )
}
function clear(reason: string) {
    for (const entry of pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(Error(reason))
    }
    pending.clear()
}
export function connect(ready: (locale: string, prefs: Prefs) => void, changed: () => void) {
    const listener = (event: MessageEvent<unknown>) => {
        if (event.source !== window.parent) return
        const result = hostSchema.safeParse(event.data)
        if (!result.success) return
        const msg = result.data
        if (msg.type === 'init' && msg.instanceId) {
            configureDebug({ enabled: msg.debug?.enabled === true })
            debug('initialized')
            if (instanceId !== msg.instanceId || revision !== (msg.scopeRevision ?? 0)) clear('Context changed')
            instanceId = msg.instanceId
            revision = msg.scopeRevision ?? 0
            for (const [key, value] of Object.entries(msg.theme?.tokens ?? {}))
                document.documentElement.style.setProperty(
                    `--xui-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
                    String(value)
                )
            installShadcnThemeVars({ density: msg.theme?.density ?? 'compact' })
            document.documentElement.classList.toggle('dark', msg.theme?.mode === 'dark')
            const query = z.object({ parameters: prefsSchema.optional() }).safeParse(msg.initialQuery)
            ready(
                msg.locale ?? 'en-US',
                query.success && query.data.parameters ? query.data.parameters : prefsSchema.parse({})
            )
            send('resize', { height: window.innerHeight, viewportBound: true })
            return
        }
        if (msg.instanceId !== instanceId) return
        if (msg.type === 'hostEvent') {
            const context = z
                .object({ type: z.literal('view.context.changed'), data: z.object({ revision: z.number() }) })
                .safeParse(msg.event)
            if (context.success && context.data.data.revision > revision) {
                revision = context.data.data.revision
                clear('Context changed')
                debug('context-changed')
                changed()
            }
            return
        }
        if (msg.scopeRevision !== undefined && msg.scopeRevision !== revision) return
        if (!msg.requestId) return
        const entry = pending.get(msg.requestId)
        if (!entry) return
        pending.delete(msg.requestId)
        debug('response', pending.size)
        clearTimeout(entry.timer)
        if (msg.type === 'error') entry.reject(Error(msg.message ?? 'Request failed'))
        else entry.resolve(msg.data ?? msg.result)
    }
    window.addEventListener('message', listener)
    send('ready')
    return () => {
        window.removeEventListener('message', listener)
        clear('View closed')
        instanceId = null
        debug('closed')
        configureDebug()
    }
}
export function request(type: string, body: object): Promise<unknown> {
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            pending.delete(requestId)
            reject(Error('Request timed out'))
        }, 30000)
        pending.set(requestId, { resolve, reject, timer })
        debug('request', pending.size)
        send(type, { ...body, requestId })
    })
}
export async function read(parameters: Partial<MapQuery>, search = '', offset = 0): Promise<MapPage> {
    return z.object({ item: mapPageSchema }).parse(
        await request('requestData', {
            query: {
                parameters: { ...parameters, offset },
                search,
                pageSize: search || parameters.conversationId ? 20 : 3
            }
        })
    ).item
}
export async function act(input: MapAction) {
    return z
        .object({ success: z.literal(true), data: z.unknown() })
        .parse(await request('executeAction', { actionKey: 'act', input })).data
}
export async function navigate(target: Navigation, copy = false) {
    const reply = z.object({ success: z.boolean(), message: z.string().optional(), code: z.string().optional() }).parse(
        await request('invokeClientCommand', {
            commandKey: copy ? 'workbench.navigation.copy-link' : 'workbench.navigation.open',
            payload: target
        })
    )
    if (!reply.success) throw Error(reply.message ?? reply.code ?? 'Navigation failed')
}
export async function savePrefs(prefs: Prefs) {
    await request('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: { target: 'workbench.view', viewKey: 'platform.conversation-map__topics', parameters: prefs }
    })
}
