import { observeModelBudgetDenials } from './pipeline-model-budget-observations'
import { projectPipelineStatistics, type ProjectPipelineGraph, type ProjectTaskGraph } from '@xpert-ai/contracts'
import { observePipelineNodes, observeOperationWaits } from './pipeline-node-observations'

type Node = ProjectPipelineGraph['nodes'][number]
type Attempt = ProjectTaskGraph['executions'][number]
const node = (patch: Partial<Node> = {}): Node => ({
    id: 'node',
    taskIds: ['task'],
    executionIds: ['execution'],
    projection: {
        key: 'node',
        nodeKey: 'step',
        expansionKey: 'item',
        title: 'Step',
        kind: 'human_gate',
        laneKey: 'role',
        stageKey: 'stage',
        taskKeys: ['task'],
        evidence: [],
        state: {
            lifecycle: 'active',
            readiness: 'blocked',
            applicability: 'selected',
            freshness: 'superseded',
            runtime: 'running'
        }
    },
    ...patch
})
const attempt = (patch: Partial<Attempt> = {}): Attempt => ({
    id: 'execution',
    taskId: 'task',
    attempt: 1,
    status: 'running',
    runtimeStatus: 'success',
    ...patch
})

it('updates runtime and running totals without changing the historical business snapshot or input', () => {
    const original = node(),
        before = structuredClone(original)
    const observed = observePipelineNodes([original], [attempt()])
    expect(observed[0].projection.state).toEqual({ ...original.projection.state, runtime: 'succeeded' })
    expect(observed[0].projection).toEqual({
        ...original.projection,
        state: { ...original.projection.state, runtime: 'succeeded' }
    })
    expect(original).toEqual(before)
    const stats = projectPipelineStatistics(observed, [attempt()], true, 'round')
    expect(stats.business).toMatchObject({ running: 0, completed: 0, blocked: 1 })
    expect(stats.attempts).toMatchObject({ running: 0, succeeded: 1 })
})

it.each([
    ['error', 'failed'],
    ['cancelled', 'cancelled'],
    ['interrupted', 'waiting'],
    ['pending', 'queued'],
    ['running', 'running'],
    ['unknown', 'unknown']
] as const)('uses the actual %s observation instead of domain acceptance', (runtimeStatus, expected) => {
    expect(
        observePipelineNodes([node()], [attempt({ status: 'succeeded', runtimeStatus })])[0].projection.state.runtime
    ).toBe(expected)
})

it('uses the latest retry per Task, but retains active work on another Task', () => {
    const n = node({ taskIds: ['task', 'parallel'], executionIds: ['execution', 'retry', 'parallel'] })
    const executions = [
        attempt({ runtimeStatus: 'error' }),
        attempt({ id: 'retry', attempt: 2 }),
        attempt({ id: 'parallel', taskId: 'parallel', runtimeStatus: 'running' })
    ]
    expect(observePipelineNodes([n], executions)[0].projection.state.runtime).toBe('running')
    executions[2].runtimeStatus = 'success'
    expect(observePipelineNodes([n], executions)[0].projection.state.runtime).toBe('succeeded')
})

it('does not import later-round or sibling executions sharing a logical Task', () => {
    const n = node(),
        executions = [attempt(), attempt({ id: 'later-round', attempt: 9, runtimeStatus: 'running' })]
    expect(observePipelineNodes([n], executions)[0].projection.state.runtime).toBe('succeeded')
    expect(observePipelineNodes([node({ executionIds: [] })], executions)[0].projection.state.runtime).toBe('running')
})

it('does not invent a whole-node result from missing ownership or partial Task coverage', () => {
    const cases = [
        node({ executionIds: undefined }),
        node({ taskIds: ['task', 'unobserved'] }),
        node({ taskIds: ['other'] })
    ]
    for (const original of cases) expect(observePipelineNodes([original], [attempt()])[0]).toBe(original)
})

it('shows resumed model denial without changing accepted evidence or unrelated nodes', () => {
    const original = node()
    original.projection.state.runtime = 'succeeded'
    original.projection.state.readiness = 'ready'
    const before = structuredClone(original)
    const other = node({ id: 'other' })
    const blocked = observeModelBudgetDenials([original, other], [{ operation: { nodeInstanceId: original.id } }])
    expect(blocked[0].projection.state).toEqual({ ...before.projection.state, runtime: 'failed', readiness: 'blocked' })
    expect(blocked[0].projection.presentation.blockers).toContain('MODEL_BUDGET_EXCEEDED')
    expect(blocked[0].projection.evidence).toEqual(before.projection.evidence)
    expect(original).toEqual(before)
    expect(blocked[1]).toBe(other)
    expect(observeModelBudgetDenials([original], [])[0]).toBe(original)
})

it('preserves a current explicit operation wait over generic running Tasks, but ignores old retries', () => {
    const original = node()
    const waiting = {
        nodeInstanceId: original.id,
        attempt: 1,
        state: 'pending',
        receipt: { status: 'pending' as const, receiptKey: 'operation', code: 'DOMAIN_AUTHORIZATION_REQUIRED' }
    }
    expect(observeOperationWaits([original], [waiting])[0].projection.state).toMatchObject({
        runtime: 'waiting',
        readiness: 'blocked'
    })
    expect(
        observeOperationWaits(
            [original],
            [waiting, { ...waiting, attempt: 2, receipt: { status: 'pending', receiptKey: 'retry' } }]
        )[0]
    ).toBe(original)
    expect(observeOperationWaits([original], [{ ...waiting, nodeInstanceId: 'other' }])[0]).toBe(original)
    expect(observeOperationWaits([original], [])[0]).toBe(original)
})
