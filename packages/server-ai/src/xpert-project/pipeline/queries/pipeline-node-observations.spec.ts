import { projectPipelineStatistics, type ProjectPipelineGraph, type ProjectTaskGraph } from '@xpert-ai/contracts'
import { observeHistoricalPipelineNodes } from './pipeline-node-observations'

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
    const observed = observeHistoricalPipelineNodes([original], [attempt()])
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
        observeHistoricalPipelineNodes([node()], [attempt({ status: 'succeeded', runtimeStatus })])[0].projection.state
            .runtime
    ).toBe(expected)
})

it('uses the latest retry per Task, but retains active work on another Task', () => {
    const n = node({ taskIds: ['task', 'parallel'], executionIds: ['execution', 'retry', 'parallel'] })
    const executions = [
        attempt({ runtimeStatus: 'error' }),
        attempt({ id: 'retry', attempt: 2 }),
        attempt({ id: 'parallel', taskId: 'parallel', runtimeStatus: 'running' })
    ]
    expect(observeHistoricalPipelineNodes([n], executions)[0].projection.state.runtime).toBe('running')
    executions[2].runtimeStatus = 'success'
    expect(observeHistoricalPipelineNodes([n], executions)[0].projection.state.runtime).toBe('succeeded')
})

it('does not import later-round or sibling executions sharing a logical Task', () => {
    const n = node(),
        executions = [attempt(), attempt({ id: 'later-round', attempt: 9, runtimeStatus: 'running' })]
    expect(observeHistoricalPipelineNodes([n], executions)[0].projection.state.runtime).toBe('succeeded')
    expect(observeHistoricalPipelineNodes([node({ executionIds: [] })], executions)[0].projection.state.runtime).toBe(
        'running'
    )
})

it('does not invent a whole-node result from missing ownership or partial Task coverage', () => {
    const cases = [
        node({ executionIds: undefined }),
        node({ taskIds: ['task', 'unobserved'] }),
        node({ taskIds: ['other'] })
    ]
    for (const original of cases) expect(observeHistoricalPipelineNodes([original], [attempt()])[0]).toBe(original)
})
