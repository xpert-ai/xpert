jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Annotation, Command, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { AgentInvocation, AgentInvocationApi, AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { awaitInvocationTasks } from './invocation-task-wait'
import { DEFAULT_TASK_WAIT_POLICY } from '../runtime-task/task-wait'

const ids = ['11111111-1111-4111-a111-111111111111', '22222222-2222-4222-a222-222222222222']
const scope: AgentInvocationScope = {
    tenantId: 't',
    organizationId: 'o',
    userId: 'u',
    parentExecutionId: 'p',
    callerAgentKey: 'a'
}
const immediate = { ...DEFAULT_TASK_WAIT_POLICY, inlineWaitMs: 0 }
function fixture(mode: 'any' | 'all' = 'all') {
    const tasks: AgentInvocation[] = ids.map((id) => ({
        id,
        status: 'running',
        revision: 1,
        scope,
        createdAt: '',
        updatedAt: '',
        request: {
            callId: id,
            target: { bindingId: 'b', provider: 'test', revision: '1', reference: 'r', configuration: {} },
            input: { prompt: 'task' }
        }
    }))
    const api: AgentInvocationApi = {
        start: jest.fn(),
        cancel: jest.fn(),
        inspect: jest.fn(async (id: string) => structuredClone(tasks.find((item) => item.id === id)!)),
        respond: jest.fn(async () => {
            tasks[0].interaction = undefined
            tasks[0].status = 'succeeded'
            return tasks[0]
        })
    }
    const request = { callId: 'wait-call', taskIds: ids, mode }
    const state = Annotation.Root({ result: Annotation<unknown> })
    const graph = new StateGraph(state)
        .addNode('wait', async () => ({ result: await awaitInvocationTasks(api, request, undefined, immediate) }))
        .addEdge(START, 'wait')
        .addEdge('wait', END)
        .compile({ checkpointer: new MemorySaver() })
    return { api, tasks, graph, request, config: { configurable: { thread_id: 'test' } } }
}

describe('bounded Agent-driven task observation', () => {
    afterEach(() => jest.useRealTimers())
    it('returns pending to the Agent normally instead of interrupting the graph', async () => {
        const f = fixture()
        const result = await f.graph.invoke({}, f.config)
        expect(result.result).toMatchObject({
            reason: 'pending',
            tasks: [{ status: 'running' }, { status: 'running' }]
        })
        const state = await f.graph.getState(f.config)
        expect(state.next).toEqual([])
        expect(state.tasks.flatMap((task) => task.interrupts)).toEqual([])
        expect(f.api.start).not.toHaveBeenCalled()
        expect(f.api.cancel).not.toHaveBeenCalled()
    })
    it('a later wait observes completion of the same handles without restarting them', async () => {
        const f = fixture()
        expect((await awaitInvocationTasks(f.api, f.request, undefined, immediate)).reason).toBe('pending')
        f.tasks.forEach((task) => {
            task.status = 'succeeded'
            task.result = { text: 'done' }
        })
        expect((await awaitInvocationTasks(f.api, f.request, undefined, immediate)).reason).toBe('completed')
        expect(f.api.start).not.toHaveBeenCalled()
    })
    it('any returns on one terminal task while all keeps waiting; failure is not success', async () => {
        const f = fixture('any')
        f.tasks[0].status = 'failed'
        f.tasks[0].error = 'test failure'
        const any = await awaitInvocationTasks(f.api, f.request, undefined, immediate)
        expect(any).toMatchObject({ reason: 'completed', tasks: [{ status: 'failed' }, { status: 'running' }] })
        expect((await awaitInvocationTasks(f.api, { ...f.request, mode: 'all' }, undefined, immediate)).reason).toBe(
            'pending'
        )
    })
    it('honors the requested duration and returns early when tasks finish', async () => {
        jest.useFakeTimers()
        const f = fixture()
        const promise = awaitInvocationTasks(f.api, { ...f.request, timeoutMs: 30_000 })
        await jest.advanceTimersByTimeAsync(1000)
        f.tasks.forEach((task) => {
            task.status = 'succeeded'
        })
        await jest.advanceTimersByTimeAsync(500)
        expect((await promise).reason).toBe('completed')
        expect(jest.getTimerCount()).toBe(0)
    })
    it('caps a requested wait at the operator limit without creating a suspension', async () => {
        jest.useFakeTimers()
        const f = fixture()
        const promise = awaitInvocationTasks(f.api, { ...f.request, timeoutMs: 60_000 }, undefined, {
            ...DEFAULT_TASK_WAIT_POLICY,
            maxInlineWaitMs: 1000
        })
        await jest.advanceTimersByTimeAsync(1000)
        expect((await promise).reason).toBe('pending')
        expect(jest.getTimerCount()).toBe(0)
    })
    it('zero duration performs one immediate read without suspending for an interaction', async () => {
        const f = fixture()
        f.tasks[0].status = 'waiting'
        f.tasks[0].interaction = { id: 'approval', kind: 'approval', prompt: 'Approve?' }
        expect((await awaitInvocationTasks(f.api, { ...f.request, timeoutMs: 0 })).reason).toBe('attention')
        expect(f.api.inspect).toHaveBeenCalledTimes(2)
        expect(f.api.respond).not.toHaveBeenCalled()
    })
    it.each([-1, 60_001])('rejects an invalid requested duration: %s', async (timeoutMs) => {
        const f = fixture()
        await expect(awaitInvocationTasks(f.api, { ...f.request, timeoutMs })).rejects.toThrow()
        expect(f.api.inspect).not.toHaveBeenCalled()
    })
    it('rejects duplicate handles before inspection', async () => {
        const f = fixture()
        await expect(awaitInvocationTasks(f.api, { ...f.request, taskIds: [ids[0], ids[0]] })).rejects.toThrow()
        expect(f.api.inspect).not.toHaveBeenCalled()
    })
    it('unknown never authorizes relaunch or implies success', async () => {
        const f = fixture()
        f.tasks[0].status = 'unknown'
        expect((await awaitInvocationTasks(f.api, f.request, undefined, immediate)).reason).toBe('unavailable')
        expect(f.api.start).not.toHaveBeenCalled()
    })
    it('only a matching human response can resolve an approval interaction', async () => {
        const f = fixture('any')
        f.tasks[0].status = 'waiting'
        f.tasks[0].interaction = { id: 'approval', kind: 'approval', prompt: 'Approve?' }
        await f.graph.invoke({}, f.config)
        await f.graph.invoke(new Command({ resume: { completed: true } }), f.config)
        expect(f.api.respond).not.toHaveBeenCalled()
        expect((await f.graph.getState(f.config)).tasks[0].interrupts[0].value).toMatchObject({ reason: 'user_input' })
        const result = await f.graph.invoke(
            new Command({ resume: { interactionId: 'approval', response: true } }),
            f.config
        )
        expect(f.api.respond).toHaveBeenCalledTimes(1)
        expect(result.result).toMatchObject({ reason: 'completed' })
    })
    it('rechecks authorization on every new observation', async () => {
        const f = fixture()
        await awaitInvocationTasks(f.api, f.request, undefined, immediate)
        jest.mocked(f.api.inspect).mockRejectedValue(new Error('revoked'))
        await expect(awaitInvocationTasks(f.api, f.request, undefined, immediate)).rejects.toThrow('revoked')
        expect(f.api.start).not.toHaveBeenCalled()
    })
})
