import { viewContextEventSchema } from '../../../../view-extension/remote-context'
import { z } from 'zod/v3'
import { agentResultItemSchema } from '@xpert-ai/plugin-sdk/agent-results'

const response = z.object({
    item: z
        .object({
            id: z.string(),
            status: z.string(),
            selectedItemId: z.string().nullable(),
            error: z.string().optional(),
            result: z
                .object({
                    text: z.string(),
                    items: z.array(agentResultItemSchema).optional(),
                    export: z.object({ status: z.string(), error: z.string().optional() }).optional(),
                    artifacts: z
                        .array(
                            z.object({ id: z.string(), name: z.string().optional(), versionId: z.string().optional() })
                        )
                        .optional()
                })
                .optional()
        })
        .nullable()
})
const envelope = z
    .object({
        channel: z.literal('xpertai.remote_component'),
        protocolVersion: z.literal(1),
        type: z.string(),
        scopeRevision: z.number().int().nonnegative().optional(),
        instanceId: z.string().optional(),
        requestId: z.string().optional(),
        locale: z.string().optional(),
        initialQuery: z
            .object({ selectionId: z.string().optional(), parameters: z.record(z.unknown()).optional() })
            .optional(),
        data: z.unknown().optional(),
        result: z.unknown().optional(),
        message: z.string().optional()
    })
    .passthrough()
const root = document.getElementById('root')!
let scopeRevision: number | undefined
let instanceId: string | undefined,
    zh = false,
    epoch = 0
const pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: number }>()
function send(type: string, body: object = {}) {
    window.parent.postMessage(
        { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, scopeRevision, type, ...body },
        '*'
    )
}
function request(type: string, body: object): Promise<unknown> {
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            pending.delete(requestId)
            reject(Error(zh ? '请求超时' : 'Request timed out'))
        }, 30000)
        pending.set(requestId, { resolve, reject, timer })
        send(type, { ...body, requestId })
    })
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, classes: string) {
    const node = document.createElement(tag)
    node.textContent = text
    node.className = classes
    return node
}
function notice(text: string) {
    root.replaceChildren(element('p', text, 'p-6 text-sm text-muted-foreground'))
}
async function load(query: unknown) {
    const current = ++epoch
    notice(zh ? '正在读取结果…' : 'Loading results…')
    try {
        const { item } = response.parse(await request('requestData', { query }))
        if (current !== epoch) return
        if (!item) {
            notice(zh ? '请从对话中的资源卡片打开结果。' : 'Open a result card from the conversation.')
            return
        }
        root.replaceChildren()
        root.className = 'mx-auto max-w-4xl space-y-6 p-6'
        root.append(element('h1', zh ? '任务结果' : 'Task results', 'text-xl font-semibold'))
        if (item.result?.text) root.append(element('p', item.result.text, 'whitespace-pre-wrap text-sm leading-6'))
        if (item.error) root.append(element('p', item.error, 'text-sm text-destructive'))
        for (const entry of item.result?.items ?? []) {
            const section = element('section', '', 'space-y-2 border-t pt-5')
            section.id = entry.id
            section.append(
                element('h2', entry.title, 'text-base font-medium'),
                element('p', entry.summary, 'whitespace-pre-wrap text-sm leading-6')
            )
            if (entry.type === 'changes')
                for (const file of entry.files)
                    section.append(
                        element(
                            'p',
                            `${zh ? { created: '新增', modified: '修改', deleted: '删除' }[file.change] : file.change} · ${file.path}`,
                            'break-all font-mono text-xs text-muted-foreground'
                        )
                    )
            if (entry.type === 'tests')
                section.append(
                    element(
                        'p',
                        [
                            zh ? { passed: '通过', failed: '失败', skipped: '未运行' }[entry.status] : entry.status,
                            entry.command
                        ]
                            .filter(Boolean)
                            .join(' · '),
                        'whitespace-pre-wrap font-mono text-xs text-muted-foreground'
                    )
                )
            if (entry.type === 'file')
                section.append(element('p', entry.path, 'break-all font-mono text-xs text-muted-foreground'))
            root.append(section)
        }
        if (item.result?.export?.status === 'failed' || item.result?.export?.status === 'unavailable')
            root.append(
                element(
                    'p',
                    zh
                        ? '文件导出未完成；上述任务执行结果已保留。请检查工作目录中的文件。'
                        : 'File export is unavailable. The task result is preserved; check the workspace files.',
                    'text-sm text-destructive'
                )
            )
        for (const file of item.result?.artifacts ?? []) {
            const row = element('section', '', 'flex items-center justify-between gap-4 rounded-lg border p-4')
            row.id = file.id
            row.append(element('span', file.name ?? file.id, 'break-all text-sm font-medium'))
            const button = element(
                'button',
                zh ? '下载文件' : 'Download',
                'shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50'
            )
            button.type = 'button'
            const error = element('p', '', 'text-sm text-destructive')
            error.setAttribute('role', 'alert')
            if (!file.versionId) {
                button.disabled = true
                error.textContent = zh
                    ? '此历史产物未记录版本，暂不可下载。'
                    : 'This older artifact has no recorded version and cannot be downloaded.'
            }
            button.onclick = async () => {
                if (!file.versionId) return
                button.disabled = true
                error.textContent = ''
                try {
                    const grant = z.object({ url: z.string(), fileName: z.string() }).parse(
                        await request('requestFileAccess', {
                            fileKey: file.id,
                            targetId: item.id,
                            purpose: 'download'
                        })
                    )
                    const url = new URL(grant.url, window.location.href)
                    if (!['http:', 'https:'].includes(url.protocol)) throw Error('Invalid download URL')
                    // Use a top-level download: opaque sandbox subframe navigation omits the session's SameSite cookie.
                    const link = document.createElement('a')
                    link.href = url.href
                    link.download = grant.fileName
                    link.target = '_blank'
                    link.rel = 'noopener noreferrer'
                    document.body.append(link)
                    link.click()
                    link.remove()
                } catch (e) {
                    error.textContent = e instanceof Error ? e.message : zh ? '下载失败' : 'Download failed'
                } finally {
                    button.disabled = false
                }
            }
            row.append(button)
            root.append(row, error)
        }
        if (item.selectedItemId) document.getElementById(item.selectedItemId)?.scrollIntoView({ block: 'start' })
    } catch (e) {
        if (current === epoch) notice(e instanceof Error ? e.message : zh ? '无法读取结果' : 'Unable to load results')
    }
}
window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const data = parsed.data
    if (data.type === 'init' && data.instanceId) {
        scopeRevision = data.scopeRevision
        instanceId = data.instanceId
        zh = data.locale?.startsWith('zh') ?? false
        void load(data.initialQuery ?? {})
        return
    }
    if (data.instanceId === instanceId && data.type === 'hostEvent') {
        const context = viewContextEventSchema.safeParse(data.event)
        if (context.success && context.data.data.revision > (scopeRevision ?? -1)) {
            scopeRevision = context.data.data.revision
            epoch++
            for (const call of pending.values()) {
                clearTimeout(call.timer)
                call.reject(Error('View context changed'))
            }
            pending.clear()
            void load({})
        }
        return
    }
    if (data.instanceId !== instanceId || !data.requestId) return
    const handler = pending.get(data.requestId)
    if (!handler) return
    pending.delete(data.requestId)
    window.clearTimeout(handler.timer)
    if (data.type === 'error') handler.reject(Error(data.message ?? 'Request failed'))
    else handler.resolve(data.data ?? data.result)
})
send('ready')
