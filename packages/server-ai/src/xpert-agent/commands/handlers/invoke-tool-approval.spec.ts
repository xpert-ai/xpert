import { createInvokeHarness, createGraph, createCompiledGraph, consumeStream } from './invoke.test-fixture'
import { Subscriber } from 'rxjs'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { CompleteToolCallsQuery } from '../../queries'
import { Annotation, END, MemorySaver, Send, START, StateGraph } from '@langchain/langgraph'
import type { RunnableConfig } from '@langchain/core/runnables'

function fixture(maxConcurrency?: number) {
    const harness = createInvokeHarness()
    const graph = createGraph()
    const compiled = createCompiledGraph(graph)
    Object.assign(compiled.agent.team.agentConfig, { maxConcurrency })
    harness.commandBus.execute.mockImplementation(async (command: unknown) =>
        command instanceof CompileGraphCommand ? compiled : null
    )
    const run = async () =>
        consumeStream(
            await harness.handler.execute(
                new XpertAgentInvokeCommand(
                    { human: { input: 'Run tools' } },
                    'agent-1',
                    { id: 'xpert-1', workspaceDataScope: 'user' },
                    {
                        isDraft: false,
                        thread_id: 'thread-1',
                        rootExecutionId: 'execution-1',
                        execution: { id: 'execution-1', threadId: 'thread-1' },
                        subscriber: new Subscriber<MessageEvent>(),
                        store: null
                    }
                )
            )
        )
    return { ...harness, graph, run }
}

it.each([undefined, 1, 4, 8])('omits legacy concurrency %s from the graph configuration', async (configured) => {
    const f = fixture(configured)
    await f.run()
    expect(f.graph.streamEvents.mock.calls[0][1]).not.toHaveProperty('maxConcurrency')
})

it('executes all fan-out tasks from a legacy serial assistant using the official scheduler', async () => {
    const f = fixture(1)
    const State = Annotation.Root({
        completed: Annotation<number[]>({ reducer: (a, b) => a.concat(b), default: () => [] })
    })
    const realGraph = new StateGraph(State)
        .addNode('dispatch', () => ({}))
        .addNode('worker', ({ index }: { index: number }) => ({ completed: [index] }))
        .addEdge(START, 'dispatch')
        .addConditionalEdges('dispatch', () => [0, 1, 2, 3, 4].map((index) => new Send('worker', { index })), [
            'worker'
        ])
        .addEdge('worker', END)
        .compile({ checkpointer: new MemorySaver() })
    f.graph.streamEvents.mockImplementation((_input: unknown, config: RunnableConfig) =>
        realGraph.streamEvents({}, { ...config, version: 'v2' })
    )
    f.graph.getState.mockImplementation((config: RunnableConfig) => realGraph.getState(config))
    await f.run()
    const state = await realGraph.getState({ configurable: { thread_id: 'thread-1' } })
    expect(state.values.completed).toEqual([0, 1, 2, 3, 4])
    expect(state.next).toEqual([])
    expect(state.tasks).toEqual([])
})

it('does not turn an unexplained pending queue into an approval', async () => {
    const f = fixture(1)
    f.graph.getState.mockResolvedValue({
        config: { configurable: { checkpoint_id: 'checkpoint' } },
        values: {},
        next: ['read'],
        tasks: [{ id: 'task', name: 'read', interrupts: [] }]
    })
    await expect(f.run()).rejects.toThrow()
    expect(f.queryBus.execute.mock.calls.some(([query]) => query instanceof CompleteToolCallsQuery)).toBe(false)
})

it.each(['static', 'dynamic'])('passes the exact checkpoint to %s tool approvals', async (mode) => {
    const f = fixture()
    const config = { configurable: { thread_id: 'thread-1', checkpoint_id: 'checkpoint-exact' } }
    const checkpoint = {
        channel_values: {
            __pregel_tasks: [[], [{ node: 'read', args: { toolCall: { id: 'call', name: 'read', args: {} } } }]]
        }
    }
    f.checkpointSaver.getTuple.mockResolvedValue({ checkpoint })
    if (mode === 'static') Object.assign(f.graph, { interruptBefore: ['read'] })
    f.graph.getState.mockResolvedValue({
        config,
        values: {},
        next: ['read'],
        tasks: [
            {
                id: 'task',
                name: 'read',
                interrupts: mode === 'dynamic' ? [{ value: 'approve' }] : [],
                path: ['__pregel_push', 0]
            }
        ]
    })
    await expect(f.run()).rejects.toThrow()
    expect(f.checkpointSaver.getTuple).toHaveBeenCalledWith(config)
    const query = f.queryBus.execute.mock.calls.find(([query]) => query instanceof CompleteToolCallsQuery)?.[0]
    expect(query?.checkpoint).toBe(checkpoint)
    expect(query?.tasks).toHaveLength(1)
})
