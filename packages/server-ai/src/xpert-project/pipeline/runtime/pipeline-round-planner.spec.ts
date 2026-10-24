import {
    initialPipelineNodeState,
    planPipelineRound,
    type ManagedPipelineDefinition,
    type PipelinePlannerNode
} from './pipeline-round-planner'

const work = (key: string): ManagedPipelineDefinition['nodes'][number] => ({
    key,
    stageKey: 'work',
    laneKey: 'engineer',
    kind: 'work',
    operationRef: 'neutral.inspect@1',
    completionRef: 'neutral.accept@1',
    executorSlot: 'engineer'
})
function definition(): ManagedPipelineDefinition {
    return {
        key: 'neutral',
        version: '1.0.0',
        title: 'Neutral evidence review',
        executionAuthority: 'platform',
        projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
        subjectResolverRef: 'neutral.document@1',
        topology: { source: 'definition' },
        roles: [
            { key: 'engineer', allowedKinds: ['assistant'] },
            { key: 'owner', allowedKinds: ['human'] }
        ],
        lanes: [
            { key: 'engineer', roleKey: 'engineer', label: 'Engineer', order: 0 },
            { key: 'owner', roleKey: 'owner', label: 'Owner', order: 1 }
        ],
        stages: [{ key: 'work', label: 'Review', order: 0 }],
        nodes: [
            { key: 'fork', stageKey: 'work', kind: 'fork' },
            work('left'),
            work('right'),
            { key: 'join', stageKey: 'work', kind: 'join', join: { mode: 'all_selected', accept: 'completed' } },
            {
                key: 'decision',
                stageKey: 'work',
                kind: 'router',
                policyRef: 'neutral.route@1',
                outcomes: ['accept', 'revise'],
                unmatched: 'block'
            },
            { key: 'approved', stageKey: 'work', kind: 'terminal', outcome: 'accepted' },
            { key: 'rework', stageKey: 'work', kind: 'terminal', outcome: 'rework', disposition: 'await_new_subject' }
        ],
        edges: [
            { from: 'fork', to: 'left' },
            { from: 'fork', to: 'right' },
            { from: 'left', to: 'join' },
            { from: 'right', to: 'join' },
            { from: 'join', to: 'decision' },
            { from: 'decision', to: 'approved', outcome: 'accept' },
            { from: 'decision', to: 'rework', outcome: 'revise' }
        ],
        roundPolicy: {
            entryNodeKey: 'fork',
            maxRounds: 3,
            onRework: 'await_new_subject_then_next_round',
            onLimit: 'attention',
            newVersionWhileActive: 'supersede_round',
            terminalOutcomes: ['accepted', 'rework']
        },
        failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
    }
}
const completed = (): PipelinePlannerNode => ({
    state: { ...initialPipelineNodeState(), lifecycle: 'completed', applicability: 'selected', readiness: 'ready' }
})
const options = { maxConcurrentExecutions: 2 }

describe('managed pipeline round planner', () => {
    it('reserves both fork branches without completing work or its join', () => {
        const plan = planPipelineRound(definition(), {}, options)
        expect(plan.actions).toEqual([
            { nodeKey: 'left', kind: 'execute' },
            { nodeKey: 'right', kind: 'execute' }
        ])
        expect(plan.nodes.fork.state.lifecycle).toBe('completed')
        expect(plan.nodes.join.state).toMatchObject({ lifecycle: 'pending', readiness: 'waiting' })
        expect(plan.completed).toBe(false)
    })
    it('does not confuse a successful runtime with accepted domain evidence', () => {
        const plan = planPipelineRound(
            definition(),
            {
                left: { state: { ...initialPipelineNodeState(), runtime: 'succeeded', lifecycle: 'active' } },
                right: completed()
            },
            options
        )
        expect(plan.actions).toEqual([])
        expect(plan.nodes.join.state.readiness).toBe('waiting')
    })
    it('joins accepted branches then requests a versioned policy decision', () => {
        const plan = planPipelineRound(definition(), { left: completed(), right: completed() }, options)
        expect(plan.nodes.join.state.lifecycle).toBe('completed')
        expect(plan.actions).toEqual([{ nodeKey: 'decision', kind: 'evaluate_policy' }])
    })
    it.each(['accept', 'revise'])('selects only the %s route and reports its terminal outcome', (outcome) => {
        const plan = planPipelineRound(
            definition(),
            { left: completed(), right: completed(), decision: { ...completed(), outcome } },
            options
        )
        expect(plan.completed).toBe(true)
        expect(plan.outcomes).toEqual([outcome === 'accept' ? 'accepted' : 'rework'])
        const excluded = outcome === 'accept' ? 'rework' : 'approved'
        expect(plan.nodes[excluded].state).toMatchObject({ applicability: 'excluded', lifecycle: 'pending' })
    })
    it.each([undefined, 'invented'])(
        'blocks a missing or invalid outcome instead of choosing a route (%s)',
        (outcome) => {
            const plan = planPipelineRound(
                definition(),
                { left: completed(), right: completed(), decision: { ...completed(), outcome } },
                options
            )
            expect(plan.blocked).toEqual([{ nodeKey: 'decision', code: 'DECISION_MISSING_OR_INVALID' }])
            expect(plan.completed).toBe(false)
            expect(plan.nodes.approved.state.applicability).toBe('undetermined')
        }
    )
    it('waits for every router to settle before considering an all_selected join', () => {
        const graph = definition()
        graph.nodes = [
            {
                key: 'route',
                kind: 'router',
                stageKey: 'work',
                policyRef: 'neutral.route@1',
                outcomes: ['a', 'b'],
                unmatched: 'block'
            },
            work('left'),
            work('right'),
            { key: 'join', kind: 'join', stageKey: 'work', join: { mode: 'all_selected', accept: 'completed' } },
            { key: 'end', kind: 'terminal', stageKey: 'work', outcome: 'accepted' }
        ]
        graph.edges = [
            { from: 'route', to: 'left', outcome: 'a' },
            { from: 'route', to: 'right', outcome: 'b' },
            { from: 'left', to: 'join' },
            { from: 'right', to: 'join' },
            { from: 'join', to: 'end' }
        ]
        graph.roundPolicy.entryNodeKey = 'route'
        graph.roundPolicy.terminalOutcomes = ['accepted']
        expect(planPipelineRound(graph, {}, options).nodes.join.state.lifecycle).toBe('pending')
        const plan = planPipelineRound(graph, { route: { ...completed(), outcome: 'a' }, left: completed() }, options)
        expect(plan.nodes.right.state.applicability).toBe('excluded')
        expect(plan.nodes.join.state.lifecycle).toBe('completed')
        expect(plan.completed).toBe(true)
    })
    it('counts unknown executions against capacity and inspects without another start', () => {
        const plan = planPipelineRound(
            definition(),
            { left: { state: { ...initialPipelineNodeState(), runtime: 'unknown' } } },
            { maxConcurrentExecutions: 1 }
        )
        expect(plan.actions).toEqual([{ nodeKey: 'left', kind: 'inspect' }])
        expect(plan.nodes.right.state.readiness).toBe('ready')
    })
    it('reserves only the configured concurrent capacity in deterministic graph order', () => {
        expect(planPipelineRound(definition(), {}, { maxConcurrentExecutions: 1 }).actions).toEqual([
            { nodeKey: 'left', kind: 'execute' }
        ])
    })
    it('blocks downstream advancement after failure without treating another successful branch as completion', () => {
        const plan = planPipelineRound(
            definition(),
            {
                left: { state: { ...initialPipelineNodeState(), lifecycle: 'failed', runtime: 'failed' } },
                right: completed()
            },
            options
        )
        expect(plan.blocked).toEqual([{ nodeKey: 'left', code: 'REQUIRED_NODE_FAILED' }])
        expect(plan.nodes.join.state.lifecycle).toBe('pending')
        expect(plan.completed).toBe(false)
    })
    it('stops new dispatch when paused, retaining unknown inspection', () => {
        const plan = planPipelineRound(
            definition(),
            { left: { state: { ...initialPipelineNodeState(), runtime: 'unknown' } } },
            { ...options, paused: true }
        )
        expect(plan.actions).toEqual([{ nodeKey: 'left', kind: 'inspect' }])
    })
    it('never revives a superseded round', () => {
        const plan = planPipelineRound(
            definition(),
            { left: completed(), right: completed() },
            { ...options, superseded: true }
        )
        expect(plan.actions).toEqual([])
        expect(Object.values(plan.nodes).every((node) => node.state.freshness === 'superseded')).toBe(true)
        expect(plan.completed).toBe(false)
    })
    it('creates a human attention instead of running a model for a human seat', () => {
        const graph = definition()
        graph.nodes[4] = {
            key: 'decision',
            kind: 'human_gate',
            stageKey: 'work',
            laneKey: 'owner',
            candidateRoleKey: 'owner',
            policyRef: 'neutral.approval@1',
            outcomes: ['accept', 'revise']
        }
        const plan = planPipelineRound(graph, { left: completed(), right: completed() }, options)
        expect(plan.actions).toEqual([{ nodeKey: 'decision', kind: 'request_human' }])
    })
    it('subscribes once for an external wait and does not equate registration with confirmation', () => {
        const graph = definition()
        graph.nodes[1] = {
            key: 'left',
            kind: 'external_wait',
            stageKey: 'work',
            laneKey: 'engineer',
            subscriptionRef: 'neutral.delivery@1'
        }
        const plan = planPipelineRound(graph, {}, options)
        expect(plan.actions).toContainEqual({ nodeKey: 'left', kind: 'subscribe' })
        expect(plan.nodes.left.state.lifecycle).toBe('pending')
    })
    it('does not mutate stored input and rejects foreign node identities', () => {
        const current = { left: completed() },
            before = JSON.stringify(current)
        planPipelineRound(definition(), current, options)
        expect(JSON.stringify(current)).toBe(before)
        expect(() => planPipelineRound(definition(), { foreign: completed() }, options)).toThrow(
            'PIPELINE_NODE_NOT_IN_DEFINITION'
        )
    })
})
