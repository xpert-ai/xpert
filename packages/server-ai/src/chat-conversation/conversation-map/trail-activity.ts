import type { InvocationTrailActivity } from '../../agent-invocation/execution-view/read-trail-activity.command'
import { groupTrailEpisodes, trailStatus } from './trail-model'
import { trailText, type TrailRun } from './trail-execution'
import type { TrailGraph } from './trail.schema'

export function appendTrailActivity(
    graph: TrailGraph,
    invocations: InvocationTrailActivity[],
    runs: TrailRun[] = []
): TrailGraph {
    // Native and external logs have independent sequences. Preserve each stream's order;
    // keep the final reply after captured work without inventing cross-stream timestamps.
    const answers = graph.steps.filter((step) => step.kind === 'message')
    graph.steps = graph.steps.filter((step) => step.kind !== 'message')
    const parents = new Map(runs.map((run) => [run.id, run.parentId]))
    for (const invocation of invocations) {
        let parentId: string | undefined = invocation.parentExecutionId
        const seen = new Set<string>()
        while (parentId && !graph.lanes.some((lane) => lane.id === parentId) && !seen.has(parentId)) {
            seen.add(parentId)
            parentId = parents.get(parentId)
        }
        if (!parentId || !graph.lanes.some((lane) => lane.id === parentId)) {
            graph.coverage.push('missing_identity')
            continue
        }
        if (graph.lanes.length >= 500) {
            graph.coverage.push('record_limit')
            break
        }
        const laneId = `invocation:${invocation.id}`
        graph.lanes.push({
            id: laneId,
            parentId,
            title: invocation.title,
            spawnStepId: graph.steps.find(
                (step) =>
                    step.executionId === invocation.parentExecutionId && step.toolCallId === invocation.sourceToolCallId
            )?.id,
            primary: false,
            status: trailStatus(invocation.status),
            invocationKind: 'activity'
        })
        const page = invocation.activity
        if (page.state === 'not_recorded' || page.state === 'expired' || page.gaps.length)
            graph.coverage.push('activity_unavailable')
        if (page.hasMore) graph.coverage.push('record_limit')
        const latest = new Map(page.items.map((item) => [item.id, item]))
        for (const item of [...latest.values()].sort((a, b) => a.firstSeq - b.firstSeq || a.id.localeCompare(b.id))) {
            if (graph.steps.length >= 5000 - answers.length) {
                graph.coverage.push('record_limit')
                break
            }
            const content = item.content
            if (content.kind !== 'tool') continue
            graph.steps.push({
                id: `activity:${invocation.id}:${item.id}`,
                laneId,
                kind: 'tool',
                activity: content.activityKind ?? (content.detail?.type === 'file_change' ? 'change' : 'other'),
                title: content.name ?? '',
                status: trailStatus(content.status),
                order: graph.steps.length,
                startedAt: item.occurredAt,
                toolCallId: item.id,
                messageId: graph.messageId,
                threadId: graph.threadId,
                input: trailText(content.input),
                output: trailText(content.output)
            })
        }
        graph.live ||=
            page.state === 'recording' ||
            ['running', 'pending', 'waiting', 'cancelling'].includes(trailStatus(invocation.status))
    }
    graph.steps.push(...answers)
    graph.steps.forEach((step, order) => {
        step.order = order
    })
    return groupTrailEpisodes(graph)
}
