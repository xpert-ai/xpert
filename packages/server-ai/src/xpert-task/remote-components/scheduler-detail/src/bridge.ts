import { z } from 'zod'
import { installShadcnThemeVars } from '../../../../../../shadcn-ui/src/theme'

const envelope = z.object({
    channel: z.literal('xpertai.remote_component'),
    type: z.string(),
    instanceId: z.string().nullish(),
    requestId: z.string().optional(),
    data: z.unknown().optional(),
    result: z.unknown().optional(),
    message: z.string().optional(),
    locale: z.string().optional(),
    initialQuery: z.object({ selectionId: z.string().optional() }).optional(),
    theme: z.object({ mode: z.string().optional(), tokens: z.record(z.union([z.string(), z.number()])) }).optional(),
    debug: z.object({ enabled: z.boolean().optional() }).optional()
})
let instanceId: string | null = null
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }>()
function send(type: string, body: object = {}) {
    window.parent.postMessage(
        { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, type, ...body },
        '*'
    )
}
export function connect(init: (selectionId: string | null, locale: string) => void) {
    const receive = (event: MessageEvent<unknown>) => {
        if (event.source !== window.parent) return
        const parsed = envelope.safeParse(event.data)
        if (!parsed.success) return
        const message = parsed.data
        if (message.type === 'init' && message.instanceId) {
            instanceId = message.instanceId
            for (const [key, value] of Object.entries(message.theme?.tokens ?? {}))
                document.documentElement.style.setProperty(
                    `--xui-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
                    String(value)
                )
            installShadcnThemeVars({ density: 'compact' })
            document.documentElement.classList.toggle('dark', message.theme?.mode === 'dark')
            document.documentElement.lang = message.locale ?? 'en-US'
            if (message.debug?.enabled)
                console.debug('[scheduler-detail] initialized', { selectionId: message.initialQuery?.selectionId })
            init(message.initialQuery?.selectionId ?? null, message.locale ?? 'en-US')
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
export function request(type: string, body: object): Promise<unknown> {
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            pending.delete(requestId)
            reject(Error('Request timed out'))
        }, 30000)
        pending.set(requestId, { resolve, reject, timer })
        send(type, { ...body, requestId })
    })
}

export const scheduleSchema = z.object({
    frequency: z.enum(['Once', 'Daily', 'Weekly', 'Monthly', 'Yearly']),
    time: z.string(),
    dayOfWeek: z.number().optional(),
    dayOfMonth: z.number().optional(),
    month: z.number().optional(),
    date: z.string().optional()
})
export const detailSchema = z.object({
    item: z
        .object({
            id: z.string(),
            name: z.string(),
            prompt: z.string(),
            options: scheduleSchema,
            timeZone: z.string().nullish(),
            status: z.enum(['scheduled', 'paused', 'archived']),
            statusReason: z.string().nullish(),
            scheduleDescription: z.string().optional(),
            runs: z.array(
                z.object({
                    id: z.string(),
                    title: z.string().nullish(),
                    status: z.string().nullish(),
                    createdAt: z.string().optional()
                })
            ),
            total: z.number(),
            page: z.number(),
            pageSize: z.number()
        })
        .nullable()
})
export type Detail = NonNullable<z.infer<typeof detailSchema>['item']>
export type Schedule = z.infer<typeof scheduleSchema>
export const actionSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    data: z.unknown().optional()
})
