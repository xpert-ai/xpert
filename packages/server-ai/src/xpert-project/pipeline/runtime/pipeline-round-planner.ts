import {
    projectPipelineDefinitionSchema,
    type ProjectPipelineDefinition,
    type ProjectPipelineNodeState
} from '@xpert-ai/contracts'

export type ManagedPipelineDefinition = Extract<ProjectPipelineDefinition, { executionAuthority?: 'platform' }>
export interface PipelinePlannerNode {
    state: ProjectPipelineNodeState
    /** Only a persisted, version-checked policy or human decision may populate this field. */
    outcome?: string
}
export interface PipelinePlannerAction {
    nodeKey: string
    kind: 'execute' | 'inspect' | 'evaluate_policy' | 'request_human' | 'subscribe'
}
export interface PipelineRoundPlan {
    nodes: Record<string, PipelinePlannerNode>
    edges: Array<
        ManagedPipelineDefinition['edges'][number] & { applicability: 'undetermined' | 'selected' | 'excluded' }
    >
    actions: PipelinePlannerAction[]
    blocked: Array<{ nodeKey: string; code: 'REQUIRED_NODE_FAILED' | 'DECISION_MISSING_OR_INVALID' }>
    completed: boolean
    outcomes: string[]
    awaitNewSubject: boolean
}

export function initialPipelineNodeState(): ProjectPipelineNodeState {
    return {
        lifecycle: 'pending',
        readiness: 'waiting',
        applicability: 'undetermined',
        freshness: 'current',
        runtime: 'none'
    }
}

/** Pure bounded DAG reduction. The transaction layer persists the plan and reserves its actions atomically. */
export function planPipelineRound(
    definition: ManagedPipelineDefinition,
    current: Readonly<Record<string, PipelinePlannerNode>>,
    options: {
        maxConcurrentExecutions: number
        reservedExternalExecutions?: number
        paused?: boolean
        superseded?: boolean
    }
): PipelineRoundPlan {
    const parsed = projectPipelineDefinitionSchema.parse(definition)
    if (parsed.executionAuthority !== 'platform') throw new Error('PIPELINE_AUTHORITY_MISMATCH')
    if (!Number.isInteger(options.maxConcurrentExecutions) || options.maxConcurrentExecutions < 1)
        throw new Error('PIPELINE_CONCURRENCY_INVALID')
    const definitions = new Map(parsed.nodes.map((node) => [node.key, node]))
    if (Object.keys(current).some((key) => !definitions.has(key))) throw new Error('PIPELINE_NODE_NOT_IN_DEFINITION')
    const nodes: PipelineRoundPlan['nodes'] = Object.fromEntries(
        parsed.nodes.map((node) => [
            node.key,
            {
                ...current[node.key],
                state: { ...(current[node.key]?.state ?? initialPipelineNodeState()) }
            }
        ])
    )
    const edges: PipelineRoundPlan['edges'] = parsed.edges.map((edge) => ({ ...edge, applicability: 'undetermined' }))
    const actions: PipelinePlannerAction[] = []
    const blocked: PipelineRoundPlan['blocked'] = []
    const inFlight = new Set(['queued', 'running', 'waiting', 'cancelling', 'unknown'])
    let capacity = Math.max(
        0,
        options.maxConcurrentExecutions -
            (options.reservedExternalExecutions ?? 0) -
            Object.values(nodes).filter((node) => inFlight.has(node.state.runtime)).length
    )
    const indegree = new Map(
        parsed.nodes.map((node) => [node.key, parsed.edges.filter((edge) => edge.to === node.key).length])
    )
    const ready = parsed.nodes.filter((node) => !indegree.get(node.key)).map((node) => node.key)
    const ordered: string[] = []
    while (ready.length) {
        const key = ready.shift()!
        ordered.push(key)
        for (const edge of edges.filter((edge) => edge.from === key)) {
            const count = indegree.get(edge.to)! - 1
            indegree.set(edge.to, count)
            if (!count) ready.push(edge.to)
        }
    }
    if (ordered.length !== parsed.nodes.length) throw new Error('PIPELINE_GRAPH_CYCLE')

    for (const key of ordered) {
        const node = nodes[key]
        const spec = definitions.get(key)!
        const incoming = edges.filter((edge) => edge.to === key)
        const outgoing = edges.filter((edge) => edge.from === key)
        if (options.superseded || node.state.freshness === 'superseded') {
            node.state.freshness = 'superseded'
            node.state.readiness = 'blocked'
            // Observe unknown work without ever reviving this generation.
            if (node.state.runtime === 'unknown') actions.push({ nodeKey: key, kind: 'inspect' })
            continue
        }
        if (incoming.length && incoming.every((edge) => edge.applicability === 'excluded')) {
            if (node.state.lifecycle !== 'pending' || node.state.runtime !== 'none')
                throw new Error('PIPELINE_ACTIVE_BRANCH_CANNOT_BE_EXCLUDED')
            node.state.applicability = 'excluded'
            node.state.readiness = 'waiting'
            outgoing.forEach((edge) => {
                edge.applicability = 'excluded'
            })
            continue
        }
        node.state.applicability =
            !incoming.length || incoming.some((edge) => edge.applicability === 'selected') ? 'selected' : 'undetermined'
        const dependencyPending = incoming.some(
            (edge) =>
                edge.applicability === 'undetermined' ||
                (edge.applicability === 'selected' && nodes[edge.from].state.lifecycle !== 'completed')
        )
        if (dependencyPending) {
            node.state.readiness = 'waiting'
            continue
        }
        node.state.readiness =
            node.state.lifecycle === 'failed' || node.state.lifecycle === 'cancelled' ? 'blocked' : 'ready'
        if (node.state.readiness === 'blocked') {
            blocked.push({ nodeKey: key, code: 'REQUIRED_NODE_FAILED' })
            continue
        }
        if (spec.kind === 'fork' || spec.kind === 'join' || spec.kind === 'terminal') {
            node.state.lifecycle = 'completed'
        }
        if (node.state.lifecycle === 'completed') {
            if (
                (spec.kind === 'router' || spec.kind === 'human_gate') &&
                (!node.outcome || !spec.outcomes.includes(node.outcome))
            ) {
                node.state.readiness = 'blocked'
                blocked.push({ nodeKey: key, code: 'DECISION_MISSING_OR_INVALID' })
                continue
            }
            outgoing.forEach((edge) => {
                edge.applicability = edge.outcome && edge.outcome !== node.outcome ? 'excluded' : 'selected'
            })
            continue
        }
        if (node.state.runtime === 'unknown') {
            actions.push({ nodeKey: key, kind: 'inspect' })
            continue
        }
        if (options.paused || inFlight.has(node.state.runtime) || node.state.lifecycle === 'active') continue
        // A succeeded Runtime is awaiting the domain completion evaluator, not another dispatch.
        if (node.state.runtime !== 'none') continue
        if (spec.kind === 'work' && capacity > 0) {
            actions.push({ nodeKey: key, kind: 'execute' })
            capacity--
        } else if (spec.kind === 'router') actions.push({ nodeKey: key, kind: 'evaluate_policy' })
        else if (spec.kind === 'human_gate') actions.push({ nodeKey: key, kind: 'request_human' })
        else if (spec.kind === 'external_wait') actions.push({ nodeKey: key, kind: 'subscribe' })
    }
    const terminals = parsed.nodes.filter(
        (node) => node.kind === 'terminal' && nodes[node.key].state.applicability === 'selected'
    )
    const completed =
        !options.superseded &&
        !blocked.length &&
        terminals.length > 0 &&
        Object.values(nodes).every(
            (node) =>
                node.state.applicability === 'excluded' ||
                (node.state.applicability === 'selected' && node.state.lifecycle === 'completed')
        )
    return {
        nodes,
        edges,
        actions,
        blocked,
        completed,
        awaitNewSubject:
            completed && terminals.some((node) => node.kind === 'terminal' && node.disposition === 'await_new_subject'),
        outcomes: completed ? terminals.map((node) => (node.kind === 'terminal' ? node.outcome : '')) : []
    }
}
