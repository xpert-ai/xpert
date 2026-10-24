import { ExecutionI18n } from './i18n/core'
import { z } from 'zod/v3'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'
import { viewContextEventSchema } from '../../../../view-extension/remote-context'
import { response, shouldPoll } from './model'
import { ExecutionView } from './view'

const envelope = z.object({
    channel: z.literal('xpertai.remote_component'),
    protocolVersion: z.literal(1),
    type: z.string(),
    instanceId: z.string().optional(),
    scopeRevision: z.number().optional(),
    requestId: z.string().optional(),
    locale: z.string().optional(),
    theme: z
        .object({
            mode: z.string().optional(),
            density: z.enum(['default', 'compact']).optional(),
            tokens: z.record(z.union([z.string(), z.number()])).optional()
        })
        .optional(),
    initialQuery: z.object({ selectionId: z.string().optional() }).optional(),
    event: z.unknown().optional(),
    data: z.unknown().optional(),
    result: z.unknown().optional(),
    message: z.string().optional()
})
let instanceId: string | undefined, scopeRevision: number | undefined, selectionId: string | undefined
installShadcnThemeVars()
let epoch = 0,
    cursor = 0,
    timer: number | undefined,
    busy = false
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: number }>()
const i18n = new ExecutionI18n()
const view = new ExecutionView(
    i18n,
    async (item, existing) => {
        if (item.content.kind !== 'tool' || !item.content.outputRef) throw Error(i18n.t('errors.noOutput'))
        const version = epoch
        const prefix = existing?.text ?? item.content.output ?? ''
        const page = z
            .object({
                item: z.object({ output: z.object({ text: z.string(), nextOffset: z.number(), hasMore: z.boolean() }) })
            })
            .parse(
                await request('requestData', {
                    query: {
                        selectionId,
                        parameters: {
                            outputKey: item.content.outputRef.key,
                            offset: existing?.nextOffset ?? prefix.length
                        }
                    }
                })
            ).item.output
        if (epoch !== version) throw Error(i18n.t('errors.viewChanged'))
        return { ...page, text: prefix + page.text }
    },
    async (file) => {
        const version = epoch
        const grant = z
            .object({ url: z.string() })
            .parse(await request('requestFileAccess', { fileKey: file.id, targetId: selectionId, purpose: 'download' }))
        if (epoch !== version) return
        const url = new URL(grant.url, location.href)
        if (!['http:', 'https:'].includes(url.protocol)) throw Error(i18n.t('errors.invalidDownload'))
        const link = document.createElement('a')
        link.href = url.href
        // Preserve the authorized Web/desktop download bridge and cookie navigation.
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.download = file.name ?? ''
        document.body.append(link)
        link.click()
        link.remove()
    }
)
document.getElementById('root')!.append(view.element)
view.clear()
function send(type: string, body: object = {}) {
    window.parent.postMessage(
        { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, scopeRevision, type, ...body },
        '*'
    )
}
function request(type: string, body: object): Promise<unknown> {
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            pending.delete(requestId)
            reject(Error(i18n.t('errors.timeout')))
        }, 30000)
        pending.set(requestId, { resolve, reject, timer: timeout })
        send(type, { ...body, requestId })
    })
}
async function load() {
    if (!selectionId || busy || document.hidden) return
    busy = true
    const version = epoch
    try {
        const data = z
            .object({ item: response })
            .parse(await request('requestData', { query: { selectionId, parameters: { after: cursor } } })).item
        if (version !== epoch) return
        cursor = data.activity?.nextCursor ?? cursor
        view.showError(false)
        view.update(data)
        if (shouldPoll(data)) timer = window.setTimeout(load, data.activity?.hasMore ? 50 : 2000)
    } catch {
        if (version === epoch) {
            view.showError(true)
            timer = window.setTimeout(load, 5000)
        }
    } finally {
        if (version === epoch) busy = false
    }
}
function reset(id?: string) {
    epoch++
    busy = false
    clearTimeout(timer)
    selectionId = id
    cursor = 0
    for (const call of pending.values()) {
        clearTimeout(call.timer)
        call.reject(Error(i18n.t('errors.viewChanged')))
    }
    pending.clear()
    view.clear()
    if (selectionId) void load()
    else view.update({ execution: null })
}
window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const data = parsed.data
    if (data.type === 'init' && data.instanceId) {
        const changed =
            data.instanceId !== instanceId ||
            data.scopeRevision !== scopeRevision ||
            data.initialQuery?.selectionId !== selectionId
        instanceId = data.instanceId
        scopeRevision = data.scopeRevision
        i18n.setLocale(data.locale)
        for (const [key, value] of Object.entries(data.theme?.tokens ?? {}))
            document.documentElement.style.setProperty(
                `--xui-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
                String(value)
            )
        installShadcnThemeVars({ density: data.theme?.density ?? 'compact' })
        document.documentElement.classList.toggle('dark', data.theme?.mode === 'dark')
        document.documentElement.lang = i18n.locale
        document.title = i18n.t('header.defaultTitle')
        view.translate()
        if (changed) reset(data.initialQuery?.selectionId)
        else view.flushSelection()
        return
    }
    if (data.instanceId !== instanceId) return
    if (data.type === 'hostEvent') {
        const context = viewContextEventSchema.safeParse(data.event)
        if (context.success && context.data.data.revision > (scopeRevision ?? -1)) {
            scopeRevision = context.data.data.revision
            reset(selectionId)
        }
        return
    }
    if (!data.requestId) return
    const call = pending.get(data.requestId)
    if (!call) return
    pending.delete(data.requestId)
    clearTimeout(call.timer)
    if (data.type === 'error') call.reject(Error(data.message ?? i18n.t('errors.requestFailed')))
    else call.resolve(data.data ?? data.result)
})
document.addEventListener('selectionchange', () => view.flushSelection())
document.addEventListener('visibilitychange', () => {
    clearTimeout(timer)
    if (!document.hidden) void load()
})
window.addEventListener('pagehide', () => {
    clearTimeout(timer)
})
send('ready')
