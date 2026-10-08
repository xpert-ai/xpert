import { viewContextEventSchema } from '../../../../view-extension/remote-context'
import { z } from 'zod'
import { PROJECT_TASK_ICON_NAMES } from '@xpert-ai/contracts'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'

const envelope = z
    .object({
        channel: z.literal('xpertai.remote_component'),
        type: z.string(),
        scopeRevision: z.number().int().nonnegative().optional(),
        event: z.unknown().optional(),
        instanceId: z.string().nullish(),
        requestId: z.string().optional(),
        data: z.unknown().optional(),
        result: z.unknown().optional(),
        locale: z.string().optional(),
        message: z.string().optional(),
        theme: z
            .object({
                mode: z.string().optional(),
                density: z.enum(['default', 'compact']).optional(),
                tokens: z.record(z.union([z.string(), z.number()]))
            })
            .optional()
    })
    .passthrough()
let instanceId: string | null = null
let scopeRevision: number | undefined
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: number }>()
export function send(type: string, body: object = {}) {
    window.parent.postMessage(
        { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, scopeRevision, type, ...body },
        '*'
    )
}
export function connect(onReady: (locale: string) => void, contextChanged: () => void) {
    const listener = (event: MessageEvent<unknown>) => {
        if (event.source !== window.parent) return
        const parsed = envelope.safeParse(event.data)
        if (!parsed.success) return
        const message = parsed.data
        if (message.type === 'init' && message.instanceId) {
            scopeRevision = message.scopeRevision
            for (const [key, value] of Object.entries(message.theme?.tokens ?? {})) {
                document.documentElement.style.setProperty(
                    `--xui-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
                    String(value)
                )
            }
            installShadcnThemeVars({ density: 'compact' })
            document.documentElement.classList.toggle('dark', message.theme?.mode === 'dark')
            document.documentElement.lang = message.locale ?? 'en-US'
            instanceId = message.instanceId
            onReady(message.locale ?? 'en-US')
            return
        }
        if (message.instanceId === instanceId && message.type === 'hostEvent') {
            const context = viewContextEventSchema.safeParse(message.event)
            if (context.success && context.data.data.revision > (scopeRevision ?? -1)) {
                scopeRevision = context.data.data.revision
                contextChanged()
            }
            return
        }
        if (!instanceId || message.instanceId !== instanceId || !message.requestId) return
        const request = pending.get(message.requestId)
        if (!request) return
        pending.delete(message.requestId)
        window.clearTimeout(request.timer)
        if (message.type === 'error') request.reject(Error(message.message ?? 'Request failed'))
        else request.resolve(message.data ?? message.result)
    }
    window.addEventListener('message', listener)
    send('ready')
    return () => {
        window.removeEventListener('message', listener)
        pending.forEach((item) => {
            window.clearTimeout(item.timer)
            item.reject(Error('View closed'))
        })
        pending.clear()
    }
}
export function request(type: string, body: object = {}): Promise<unknown> {
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
export const nodeSchema = z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['todo', 'in_progress', 'review', 'paused', 'done', 'blocked', 'cancelled']),
    progress: z.number().finite().min(0).max(100).nullish(),
    kind: z.enum(['task', 'summary', 'milestone']),
    taskType: z.string().nullish(),
    presentation: z
        .object({
            label: z.object({ en_US: z.string(), zh_Hans: z.string().optional() }),
            icon: z.enum(PROJECT_TASK_ICON_NAMES)
        })
        .nullish()
        .catch(null),
    executor: z.object({ provider: z.string(), toolId: z.string().optional() }).nullish(),
    parentTaskId: z.string().nullable(),
    predecessorIds: z.array(z.string()),
    providerKey: z.string().nullable(),
    sourceKey: z.string().nullable(),
    revision: z.number(),
    plannedStartAt: z.string().nullable(),
    plannedEndAt: z.string().nullable(),
    estimatedDurationMs: z.number().nullable(),
    actualStartAt: z.string().nullable(),
    actualEndAt: z.string().nullable(),
    diagnostic: z.string().nullable(),
    assigneeXpertId: z.string().nullable(),
    assigneeName: z.string().nullish(),
    assigneeAvatar: z
        .object({
            url: z.string().optional(),
            background: z.string().optional(),
            emoji: z.object({ id: z.string(), unified: z.string().optional() }).optional()
        })
        .nullish()
})
export const graphSchema = z.object({
    projectId: z.string(),
    projectTitle: z.string().optional(),
    canEditPlan: z.boolean().optional(),
    cursor: z.string(),
    tasks: z.array(nodeSchema),
    executions: z.array(
        z.object({
            id: z.string(),
            taskId: z.string(),
            attempt: z.number(),
            status: z.string(),
            invocationId: z.string().nullish(),
            invocationStatus: z
                .enum(['queued', 'running', 'waiting', 'cancelling', 'succeeded', 'failed', 'cancelled', 'unknown'])
                .nullish(),
            runtimeProvider: z.string().optional(),
            runtimeToolId: z.string().optional(),
            runtimeStatus: z.string().optional(),
            runtimeStartedAt: z.string().nullish(),
            runtimeCompletedAt: z.string().nullish(),
            agentExecutionId: z.string().nullish(),
            startedAt: z.string().nullish(),
            completedAt: z.string().nullish(),
            error: z.string().nullish(),
            outputSummary: z.string().nullish()
        })
    ),
    diagnostics: z.array(z.object({ providerKey: z.string(), message: z.string() }))
})
export type Graph = z.infer<typeof graphSchema>
export type Node = z.infer<typeof nodeSchema>
