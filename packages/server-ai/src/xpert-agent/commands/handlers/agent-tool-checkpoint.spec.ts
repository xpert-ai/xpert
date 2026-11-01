import { BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { getContextVariable } from '@langchain/core/context'
import type { RunnableConfig } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { Annotation, Command, END, interrupt, Send, START, StateGraph } from '@langchain/langgraph'
import { MemorySaver } from '@langchain/langgraph-checkpoint'
import { channelName, CONTEXT_VARIABLE_CURRENTSTATE } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { routeAgentToolCalls } from './agent-navigation'
import { AGENT_TOOL_SNAPSHOTS, installAgentToolSnapshots } from './agent-tool-snapshots'
import { ToolNode } from './tool_node'

describe('agent tool checkpoints', () => {
    it('isolates simultaneous dispatch batches and replaces snapshots on the next turn', async () => {
        const State = Annotation.Root({
            messages: Annotation<BaseMessage[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
            value: Annotation<number>({ reducer: (old, next) => old + next, default: () => 0 })
        })
        const observed: number[] = []
        const projectTool = tool(
            async (_, config) => {
                observed.push(config.configurable.runtimeState.value)
                return 'done'
            },
            { name: 'project_update', schema: z.object({}) }
        )
        const saver = new MemorySaver()
        const createGraph = (pause: boolean) => {
            const graph = new StateGraph(State)
                .addNode('model_a', () => ({ value: 1 }))
                .addNode('model_b', () => ({ value: 2 }))
                .addNode(projectTool.name, new ToolNode([projectTool], { toolName: 'Project' }))
                .addEdge(START, 'model_a')
                .addEdge(START, 'model_b')
                .addEdge(projectTool.name, END)
            for (const producer of ['model_a', 'model_b'] as const) {
                graph.addConditionalEdges(
                    producer,
                    (state, config) =>
                        routeAgentToolCalls(
                            [{ name: projectTool.name, id: producer, args: {} }],
                            state,
                            new Set([projectTool.name]),
                            projectTool.name,
                            config
                        ),
                    [projectTool.name]
                )
            }
            return installAgentToolSnapshots(
                graph.compile({
                    checkpointer: saver,
                    interruptBefore: pause ? [projectTool.name] : []
                })
            )
        }
        const config = { configurable: { thread_id: 'simultaneous-batches' } }
        await createGraph(true).invoke({ value: 10 }, config)
        expect((await saver.getTuple(config)).checkpoint.channel_values[AGENT_TOOL_SNAPSHOTS]).toHaveLength(2)
        await createGraph(false).invoke(null, config)
        expect(observed.sort((a, b) => a - b)).toEqual([11, 12])
        expect((await saver.getTuple(config)).checkpoint.channel_values[AGENT_TOOL_SNAPSHOTS]).toEqual([])
        observed.length = 0
        await createGraph(true).invoke({ value: 10 }, config)
        expect((await saver.getTuple(config)).checkpoint.channel_values[AGENT_TOOL_SNAPSHOTS]).toHaveLength(2)
        await createGraph(false).invoke(null, config)
        expect(observed.sort((a, b) => a - b)).toEqual([24, 25])
        expect((await saver.getTuple(config)).checkpoint.channel_values[AGENT_TOOL_SNAPSHOTS]).toEqual([])
    })

    it.each([false, true])('keeps the dispatch snapshot when an upstream sibling writes (pause=%s)', async (pause) => {
        const State = Annotation.Root({
            messages: Annotation<BaseMessage[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
            value: Annotation<number>({ reducer: (old, next) => old + next, default: () => 0 })
        })
        const observed: number[] = []
        const projectTool = tool(
            async (_, config) => {
                observed.push(config.configurable.runtimeState.value)
                return 'done'
            },
            { name: 'project_update', schema: z.object({}) }
        )
        const saver = new MemorySaver()
        const createGraph = (pause: boolean) =>
            installAgentToolSnapshots(
                new StateGraph(State)
                    .addNode('model', () => ({ value: 1 }))
                    .addNode('sibling', () => ({ value: 2 }))
                    .addNode(projectTool.name, new ToolNode([projectTool], { toolName: 'Project' }))
                    .addEdge(START, 'model')
                    .addEdge(START, 'sibling')
                    .addConditionalEdges(
                        'model',
                        (state, config) => {
                            expect(state.value).toBe(11)
                            return routeAgentToolCalls(
                                [{ name: projectTool.name, id: 'call-1', args: {} }],
                                state,
                                new Set([projectTool.name]),
                                projectTool.name,
                                config
                            )
                        },
                        [projectTool.name]
                    )
                    .addEdge(projectTool.name, END)
                    .addEdge('sibling', END)
                    .compile({ checkpointer: saver, interruptBefore: pause ? [projectTool.name] : [] })
            )
        const config = { configurable: { thread_id: `upstream-${pause}` } }
        await createGraph(pause).invoke({ value: 10 }, config)
        if (pause) await createGraph(false).invoke(null, config)
        expect(observed).toEqual([11])
    })

    it('keeps the original tool context after resume with Command.update', async () => {
        const State = Annotation.Root({
            messages: Annotation<BaseMessage[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
            projectId: Annotation<string>()
        })
        const observed: string[] = []
        const projectTool = tool(
            async (_, config) => {
                observed.push(config.configurable.runtimeState.projectId)
                interrupt('approve')
                return 'done'
            },
            { name: 'project_update', schema: z.object({}) }
        )
        const saver = new MemorySaver()
        const createGraph = () =>
            installAgentToolSnapshots(
                new StateGraph(State)
                    .addNode('model', () => ({}))
                    .addNode(projectTool.name, new ToolNode([projectTool], { toolName: 'Project' }))
                    .addEdge(START, 'model')
                    .addConditionalEdges(
                        'model',
                        (state, config) =>
                            routeAgentToolCalls(
                                [{ name: projectTool.name, id: 'call-1', args: {} }],
                                state,
                                new Set([projectTool.name]),
                                projectTool.name,
                                config
                            ),
                        [projectTool.name]
                    )
                    .addEdge(projectTool.name, END)
                    .compile({ checkpointer: saver })
            )
        const config = { configurable: { thread_id: 'resume-update' } }
        await createGraph().invoke({ projectId: 'original' }, config)
        const result = await createGraph().invoke(
            new Command({
                resume: 'approved',
                update: { projectId: 'updated-on-resume' }
            }),
            config
        )
        expect(result.projectId).toBe('updated-on-resume')
        expect(observed).toEqual(['original', 'original'])
    })

    it.each([false, true])('restores compact parallel checkpoints with full tool context (trace=%s)', async (trace) => {
        const caller = 'test-agent'
        const channel = channelName(caller)
        const State = Annotation.Root({
            messages: Annotation<BaseMessage[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
            [channel]: Annotation<{ messages: BaseMessage[] }>({
                reducer: (old, next) => ({ messages: [...old.messages, ...next.messages] }),
                default: () => ({ messages: [] })
            }),
            projectId: Annotation<string>()
        })
        const runtimeStates: unknown[] = []
        const contextStates: unknown[] = []
        const execute = jest.fn(async ({ index }: { index: number }, config?: RunnableConfig) => {
            runtimeStates.push(config.configurable.runtimeState)
            contextStates.push(getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE))
            expect(config.configurable.tenantId).toBe('tenant-1')
            return `result-${index}`
        })
        const projectTool = tool(execute, { name: 'project_update', schema: z.object({ index: z.number() }) })
        const observedStates: unknown[] = []
        const saver = new MemorySaver()
        const createGraph = (pause: boolean) => {
            const node = new ToolNode([projectTool], {
                caller,
                toolName: 'Project',
                wrapToolCall: async (request, handler) => {
                    observedStates.push(request.state)
                    return handler(request)
                }
            })
            node.trace = trace
            return installAgentToolSnapshots(
                new StateGraph(State)
                    .addNode('model', () => ({}))
                    .addNode(projectTool.name, node)
                    .addEdge(START, 'model')
                    .addConditionalEdges(
                        'model',
                        (state, config) =>
                            routeAgentToolCalls(
                                Array.from({ length: 6 }, (_, index) => ({
                                    name: projectTool.name,
                                    id: `call-${index}`,
                                    args: { index }
                                })),
                                state,
                                new Set([projectTool.name]),
                                projectTool.name,
                                config
                            ),
                        [projectTool.name]
                    )
                    .addEdge(projectTool.name, END)
                    .compile({ checkpointer: saver, interruptBefore: pause ? [projectTool.name] : [] })
            )
        }
        const config = { configurable: { thread_id: 'parallel-checkpoint', tenantId: 'tenant-1' } }
        const history = new HumanMessage(`history-marker:${'x'.repeat(64 * 1024)}`)
        await createGraph(true).invoke(
            { messages: [history], [channel]: { messages: [history] }, projectId: 'project-1' },
            config
        )

        expect(execute).not.toHaveBeenCalled()
        const checkpoint = await saver.getTuple(config)
        const pendingTasks = JSON.stringify(checkpoint.checkpoint.channel_values.__pregel_tasks)
        expect(Buffer.byteLength(pendingTasks)).toBeLessThan(8 * 1024)
        expect(pendingTasks.includes('history-marker:')).toBe(false)
        expect(checkpoint.checkpoint.channel_values[AGENT_TOOL_SNAPSHOTS]).toHaveLength(1)

        const result = await createGraph(false).invoke(null, config)
        expect((await saver.getTuple(config)).checkpoint.channel_values[AGENT_TOOL_SNAPSHOTS]).toEqual([])
        expect(result).not.toHaveProperty(AGENT_TOOL_SNAPSHOTS)
        expect(execute).toHaveBeenCalledTimes(6)
        expect(observedStates).toHaveLength(6)
        expect(runtimeStates).toHaveLength(6)
        expect(contextStates).toHaveLength(6)
        for (const state of [...observedStates, ...runtimeStates, ...contextStates]) {
            expect(state).toMatchObject({
                messages: [expect.objectContaining({ content: history.content })],
                [channel]: { messages: [expect.objectContaining({ content: history.content })] },
                projectId: 'project-1'
            })
        }
        expect(result.messages.filter((message): message is ToolMessage => message instanceof ToolMessage)).toEqual(
            Array.from({ length: 6 }, (_, index) =>
                expect.objectContaining({ tool_call_id: `call-${index}`, content: `result-${index}` })
            )
        )
    })

    it('resumes an interrupted call without replaying siblings or exposing their pending writes', async () => {
        const State = Annotation.Root({
            messages: Annotation<BaseMessage[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
            completed: Annotation<number[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
            projectId: Annotation<string>()
        })
        const executed: number[] = []
        const observedStates: unknown[] = []
        const projectTool = tool(
            async ({ index }, config) => {
                if (index === 1) {
                    expect(interrupt('approve')).toBe('approved')
                }
                executed.push(index)
                return new Command({
                    update: {
                        completed: [index],
                        messages: [new ToolMessage({ content: 'done', tool_call_id: config.configurable.tool_call_id })]
                    }
                })
            },
            { name: 'project_update', schema: z.object({ index: z.number() }) }
        )
        const saver = new MemorySaver()
        const createGraph = () =>
            installAgentToolSnapshots(
                new StateGraph(State)
                    .addNode('model', () => ({}))
                    .addNode(
                        projectTool.name,
                        new ToolNode([projectTool], {
                            toolName: 'Project',
                            wrapToolCall: async (request, handler) => {
                                observedStates.push(request.state)
                                return handler(request)
                            }
                        })
                    )
                    .addEdge(START, 'model')
                    .addConditionalEdges(
                        'model',
                        (state, config) =>
                            routeAgentToolCalls(
                                [0, 1].map((index) => ({
                                    name: projectTool.name,
                                    id: `call-${index}`,
                                    args: { index }
                                })),
                                state,
                                new Set([projectTool.name]),
                                projectTool.name,
                                config
                            ),
                        [projectTool.name]
                    )
                    .addEdge(projectTool.name, END)
                    .compile({ checkpointer: saver })
            )
        const config = { configurable: { thread_id: 'interrupted-parallel' } }
        await createGraph().invoke({ messages: [new HumanMessage('update')], projectId: 'project-1' }, config)
        expect(executed).toEqual([0])
        const result = await createGraph().invoke(new Command({ resume: 'approved' }), config)

        expect(executed).toEqual([0, 1])
        expect(result.completed).toEqual([0, 1])
        expect(result.messages).toHaveLength(3)
        expect(observedStates).toHaveLength(3)
        for (const state of observedStates) {
            expect(state).toMatchObject({
                messages: [expect.objectContaining({ content: 'update' })],
                projectId: 'project-1',
                completed: []
            })
        }
    })

    it('reads the correct subgraph and thread state during concurrent runs', async () => {
        const State = Annotation.Root({
            messages: Annotation<BaseMessage[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
            projectId: Annotation<string>()
        })
        const projectTool = tool(async (_, config) => config.configurable.runtimeState.projectId, {
            name: 'project_update',
            schema: z.object({})
        })
        const child = installAgentToolSnapshots(
            new StateGraph(State)
                .addNode('model', (state) => ({ projectId: `child-${state.projectId}` }))
                .addNode(projectTool.name, new ToolNode([projectTool], { toolName: 'Project' }))
                .addEdge(START, 'model')
                .addConditionalEdges(
                    'model',
                    (state, config) =>
                        routeAgentToolCalls(
                            [{ name: projectTool.name, id: 'call-1', args: {} }],
                            state,
                            new Set([projectTool.name]),
                            projectTool.name,
                            config
                        ),
                    [projectTool.name]
                )
                .addEdge(projectTool.name, END)
                .compile()
        )
        const parent = installAgentToolSnapshots(
            new StateGraph(State)
                .addNode('agent', child)
                .addEdge(START, 'agent')
                .addEdge('agent', END)
                .compile({ checkpointer: new MemorySaver() })
        )

        const results = await Promise.all(
            ['project-a', 'project-b'].map((projectId) =>
                parent.invoke({ projectId }, { configurable: { thread_id: projectId } })
            )
        )
        expect(results[0].messages[0]).toMatchObject({ content: 'child-project-a' })
        expect(results[1].messages[0]).toMatchObject({ content: 'child-project-b' })
    })

    it('still restores legacy full-state Send packets', async () => {
        const State = Annotation.Root({
            messages: Annotation<BaseMessage[]>({ reducer: (old, next) => [...old, ...next], default: () => [] })
        })
        const observed = jest.fn()
        const projectTool = tool(async () => 'updated', { name: 'project_update', schema: z.object({}) })
        const saver = new MemorySaver()
        const createGraph = (pause: boolean) =>
            installAgentToolSnapshots(
                new StateGraph(State)
                    .addNode('model', () => ({}))
                    .addNode(
                        projectTool.name,
                        new ToolNode([projectTool], {
                            toolName: 'Project',
                            wrapToolCall: async (request, handler) => {
                                observed(request.state)
                                return handler(request)
                            }
                        })
                    )
                    .addEdge(START, 'model')
                    .addConditionalEdges(
                        'model',
                        (state) =>
                            new Send(projectTool.name, {
                                ...state,
                                toolCall: { name: projectTool.name, id: 'legacy-call', args: {} }
                            }),
                        [projectTool.name]
                    )
                    .addEdge(projectTool.name, END)
                    .compile({ checkpointer: saver, interruptBefore: pause ? [projectTool.name] : [] })
            )
        const config = { configurable: { thread_id: 'legacy-checkpoint' } }
        await createGraph(true).invoke({ messages: [new HumanMessage('legacy-history')] }, config)
        const result = await createGraph(false).invoke(null, config)
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({ messages: [expect.objectContaining({ content: 'legacy-history' })] })
        )
        expect(result.messages[1]).toMatchObject({ tool_call_id: 'legacy-call', content: 'updated' })
    })
})
