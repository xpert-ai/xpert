import { z } from 'zod/v3'
import { agentTaskResultSchema } from '@xpert-ai/plugin-sdk/agent-results'
import { executionActivityItemSchema } from '../../../../../../contracts/src/ai/execution-activity.model'
import { isJsonValue, type JsonValue } from './json-tree'

export const response = z.object({
    execution: z
        .object({
            id: z.string(),
            provider: z.string(),
            status: z.string(),
            createdAt: z.string(),
            updatedAt: z.string(),
            workingDirectory: z.string().optional(),
            tool: z.object({ id: z.string(), version: z.string() }).optional(),
            error: z.string().optional(),
            result: z
                .object({
                    text: z.string(),
                    artifacts: z
                        .array(
                            z.object({ id: z.string(), versionId: z.string().optional(), name: z.string().optional() })
                        )
                        .optional()
                })
                .optional()
        })
        .nullable(),
    activity: z
        .object({
            items: z.array(
                executionActivityItemSchema.extend({ seq: z.number(), firstSeq: z.number(), observedAt: z.string() })
            ),
            nextCursor: z.number(),
            hasMore: z.boolean(),
            state: z.enum(['not_recorded', 'recording', 'closed', 'expired']),
            gaps: z.array(z.string())
        })
        .optional()
})
export type Snapshot = z.infer<typeof response>
export type Activity = NonNullable<Snapshot['activity']>['items'][number]
export type Execution = NonNullable<Snapshot['execution']>
export type Output = { text: string; nextOffset: number; hasMore: boolean }
export type Label = (en: string, cn: string) => string

/** JSON is a presentation format only. Business summaries still require the versioned SDK contract. */
export function publicReply(value: string): { text: string; raw?: string; json?: string; data?: JsonValue } {
    const trimmed = value.trim()
    const candidate = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed)?.[1] ?? trimmed
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) return { text: value }
    try {
        const json: unknown = JSON.parse(candidate)
        if (!isJsonValue(json)) return { text: value }
        const parsed = agentTaskResultSchema.safeParse(json)
        return {
            text: parsed.success && typeof parsed.data.summary === 'string' ? parsed.data.summary : '',
            raw: value,
            json: JSON.stringify(json, null, 2),
            data: json
        }
    } catch {
        return { text: value }
    }
}

export function stateLabel(value: string, label: Label) {
    const states: { [key: string]: [string, string] } = {
        queued: ['Queued', '等待执行'],
        running: ['Running', '执行中'],
        waiting: ['Waiting for input', '等待输入'],
        cancelling: ['Stopping', '停止中'],
        succeeded: ['Succeeded', '执行成功'],
        failed: ['Failed', '执行失败'],
        cancelled: ['Stopped', '已停止'],
        unknown: ['Unknown', '状态未知']
    }
    return states[value] ? label(...states[value]) : value
}
export function activityText(item: Activity, output?: Output) {
    const c = item.content
    if (c.kind !== 'tool') return c.kind === 'message' ? publicReply(c.text).text || c.text : c.text
    const detail = c.detail
    return [
        detail?.type === 'command' ? `$ ${detail.command}` : c.name,
        c.input,
        detail?.type === 'file_change'
            ? detail.files.map((f) => [f.path, f.patch].filter(Boolean).join('\n')).join('\n')
            : '',
        output?.text ?? c.output,
        detail?.type === 'command' && detail.exitCode !== undefined ? `Exit code: ${detail.exitCode}` : ''
    ]
        .filter(Boolean)
        .join('\n')
}
export function isDuplicateSummary(text: string, items: Iterable<Activity>) {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
    const publicText = (value: string) => {
        const reply = publicReply(value)
        return reply.text || reply.json || value
    }
    const summary = normalize(publicText(text))
    return (
        !!summary &&
        [...items].some(
            (item) => item.content.kind === 'message' && normalize(publicText(item.content.text)) === summary
        )
    )
}
export function shouldPoll(data: Snapshot) {
    if (data.activity?.hasMore || data.activity?.state === 'recording') return true
    return (
        !!data.execution &&
        !['succeeded', 'failed', 'cancelled'].includes(data.execution.status) &&
        !(data.execution.status === 'unknown' && data.activity?.state === 'closed')
    )
}
