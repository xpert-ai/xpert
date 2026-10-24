import { nextActionableNode, blockedNodes } from './selection'
import type { PipelineNode } from './bridge'
const node = (id: string, presentation?: PipelineNode['projection']['presentation']): PipelineNode => ({
    id,
    taskIds: [id],
    projection: {
        key: id,
        nodeKey: id,
        expansionKey: 'subject',
        title: id,
        kind: 'work',
        laneKey: 'role',
        stageKey: id,
        taskKeys: [id],
        evidence: [],
        presentation,
        state: {
            lifecycle: 'pending',
            readiness: 'ready',
            runtime: 'none',
            applicability: 'selected',
            freshness: 'current'
        }
    }
})
it('uses explicit provider navigation priority and never infers it from a running Agent', () => {
    const early = node('early', { nextActionable: true }),
        late = node('late', { nextActionable: true })
    const graph = {
        historical: false,
        nodes: [late, node('legacy'), early],
        definition: {
            stages: [
                { key: 'early', label: 'Early', order: 1 },
                { key: 'late', label: 'Late', order: 2 }
            ]
        }
    }
    expect(nextActionableNode(graph)?.id).toBe('early')
    early.projection.state.applicability = 'excluded'
    expect(nextActionableNode(graph)?.id).toBe('late')
    late.projection.state.freshness = 'superseded'
    expect(nextActionableNode(graph)).toBeUndefined()
    late.projection.state.freshness = 'current'
    expect(nextActionableNode({ ...graph, historical: true })).toBeUndefined()
})
it('does not surface superseded or excluded blockers as current work', () => {
    const current = node('current'),
        old = node('old'),
        excluded = node('excluded')
    for (const item of [current, old, excluded]) item.projection.state.readiness = 'blocked'
    old.projection.state.freshness = 'superseded'
    excluded.projection.state.applicability = 'excluded'
    expect(blockedNodes({ nodes: [old, current, excluded] }).map((item) => item.id)).toEqual(['current'])
})

it('uses platform readiness while excluding terminal or unresolved paths', () => {
    const ready = node('ready'),
        cancelled = node('cancelled')
    cancelled.projection.state.lifecycle = 'cancelled'
    const graph = {
        historical: false,
        instance: { authority: 'platform' as const },
        nodes: [cancelled, ready],
        definition: { stages: [] }
    }
    expect(nextActionableNode(graph)?.id).toBe('ready')
    ready.projection.state.applicability = 'undetermined'
    expect(nextActionableNode(graph)).toBeUndefined()
})
