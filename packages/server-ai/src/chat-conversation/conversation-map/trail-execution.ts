// Invariants: callers authorize the reply's ancestor path first. Only public message components enter the graph.
// Execution ancestry determines ownership; missing identity is displayed explicitly, never matched by Agent name.
import { z } from 'zod'
import type { IChatMessage, TChatAgentRunSummary } from '@xpert-ai/contracts'
import { trailActivityKindSchema } from '@xpert-ai/contracts'
import { redactCredentials } from '../../shared/redact-credentials'
import { groupTrailEpisodes, trailStatus } from './trail-model'
import type { TrailGraph, TrailLane, TrailStep } from './trail.schema'
import { visibleText } from './presentation'

export type TrailRun = TChatAgentRunSummary & { completedAt?: string; elapsedMs?: number }
const toolSchema = z.object({
    id: z.string().optional(),
    category: z.literal('Tool'),
    tool: z.string().optional(),
    title: z.string().optional(),
    status: z.string().optional(),
    created_date: z.coerce.date().optional(),
    end_date: z.coerce.date().optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    activityKind: trailActivityKindSchema.optional()
})
const componentSchema = z.object({
    type: z.literal('component'),
    id: z.string().optional(),
    executionId: z.string().optional(),
    data: toolSchema
})

export function trailText(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined
    try {
        return redactCredentials(typeof value === 'string' ? value : JSON.stringify(value)).slice(0, 4000)
    } catch {
        return undefined
    }
}

export function executionTrail(
    conversationId: string,
    threadId: string,
    title: string,
    message: IChatMessage,
    runs: TrailRun[]
): TrailGraph {
    const graph: TrailGraph = {
        version: 1,
        layer: 'execution',
        conversationId,
        threadId,
        messageId: message.id,
        title,
        lanes: [],
        steps: [],
        episodes: [],
        coverage: ['timing_unavailable'],
        live: !message.historical && trailStatus(message.status) === 'running'
    }
    if (message.historical) graph.coverage.push('historical')
    const root = runs.find((run) => run.isRoot || run.id === message.executionId)
    if (!root) {
        graph.coverage.push('no_execution')
        return graph
    }
    const runById = new Map(runs.map((run) => [run.id, run]))
    const visible = runs.filter(
        (run) => run === root || ((run.category === 'agent' || run.category === 'xpert') && run.type !== 'middleware')
    )
    const visibleIds = new Set(visible.map((run) => run.id))
    const parentOf = (run: TrailRun) => {
        const seen = new Set([run.id])
        let parent = run.parentId
        while (parent && !seen.has(parent)) {
            if (visibleIds.has(parent)) return parent
            seen.add(parent)
            parent = runById.get(parent)?.parentId
        }
        return null
    }
    for (const run of visible.slice(0, 499)) {
        if (run !== root && !parentOf(run)) {
            graph.coverage.push('missing_identity')
            continue
        }
        const lane: TrailLane = {
            id: run.id,
            parentId: run === root ? null : parentOf(run),
            title: run.xpertName || run.title || '',
            primary: run === root,
            status: trailStatus(run.status),
            executionId: run.id,
            messageId: message.id,
            threadId,
            invocationKind: run.invocationKind,
            outcome: run.businessOutcome,
            elapsedMs: run.elapsedMs
        }
        graph.lanes.push(lane)
    }
    if (visible.length > 499) graph.coverage.push('record_limit')
    const laneIds = new Set(graph.lanes.map((lane) => lane.id))
    const laneFor = (id?: string) => {
        const seen = new Set<string>()
        while (id && !seen.has(id)) {
            if (laneIds.has(id)) return id
            seen.add(id)
            id = runById.get(id)?.parentId
        }
        const missing = `unassigned:${root.id}`
        if (!laneIds.has(missing)) {
            graph.lanes.push({ id: missing, parentId: root.id, title: '', primary: false, status: 'unknown' })
            laneIds.add(missing)
            graph.coverage.push('missing_identity')
        }
        return missing
    }
    const calls = new Map<string, TrailStep>()
    const add = (tool: z.infer<typeof toolSchema>, executionId?: string, componentId?: string) => {
        const callId = tool.id ?? componentId
        if (!callId) {
            graph.coverage.push('missing_identity')
            return
        }
        const laneId = laneFor(executionId)
        const id = `tool:${laneId}:${callId}`
        const previous = calls.get(id)
        const status = trailStatus(tool.status)
        if (
            previous &&
            ['success', 'error', 'interrupted'].includes(previous.status) &&
            ['running', 'pending', 'waiting', 'cancelling', 'unknown'].includes(status)
        )
            return
        calls.set(id, {
            ...previous,
            id,
            laneId,
            kind: 'tool',
            toolCallId: callId,
            activity: tool.activityKind ?? previous?.activity ?? 'other',
            title: tool.title || tool.tool || previous?.title || '',
            status,
            order: previous?.order ?? calls.size,
            executionId,
            messageId: message.id,
            threadId,
            startedAt: tool.created_date?.toISOString() ?? previous?.startedAt,
            endedAt: tool.end_date?.toISOString() ?? previous?.endedAt,
            input: trailText(tool.input) ?? previous?.input,
            output: trailText(tool.output) ?? previous?.output
        })
    }
    if (Array.isArray(message.content))
        for (const item of message.content) {
            const parsed = componentSchema.safeParse(item)
            if (parsed.success) add(parsed.data.data, parsed.data.executionId, parsed.data.id)
        }
    // Legacy event arrays lack execution ownership. Do not duplicate already persisted component calls.
    for (const event of message.events ?? []) {
        const parsed = toolSchema.safeParse(event)
        if (parsed.success && ![...calls.values()].some((call) => call.toolCallId === parsed.data.id)) add(parsed.data)
    }
    graph.steps = [...calls.values()].slice(0, 4999)
    if (calls.size > 4999) graph.coverage.push('record_limit')
    for (const lane of graph.lanes) {
        const run = runById.get(lane.id)
        lane.spawnStepId = graph.steps.find(
            (step) => step.executionId === run?.parentId && step.toolCallId === run?.sourceToolCallId
        )?.id
    }
    const answer = visibleText(message.content).trim()
    if (answer)
        graph.steps.push({
            id: `answer:${message.id}`,
            laneId: root.id,
            kind: 'message',
            activity: 'answer',
            title: answer.slice(0, 100),
            preview: answer.slice(0, 4000),
            status: trailStatus(message.status),
            order: graph.steps.length,
            messageId: message.id,
            threadId,
            executionId: root.id
        })
    if (!calls.size) graph.coverage.push('activity_unavailable')
    graph.live ||=
        !message.historical &&
        graph.lanes.some((lane) => ['running', 'pending', 'waiting', 'cancelling'].includes(lane.status))
    return groupTrailEpisodes(graph)
}
