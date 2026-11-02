import { AIMessageChunk, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import {
    Annotation,
    Command,
    END,
    interrupt,
    MemorySaver,
    messagesStateReducer,
    Send,
    START,
    StateGraph
} from '@langchain/langgraph'
import { z } from 'zod/v3'
import { findToolCallOrigin } from '../../queries/handlers/tool-call-origin'
import { toolApprovalTasks } from './tool-approval-tasks'
import { routeAgentToolCalls } from './agent-navigation'
import { resolveAgentToolInput } from './agent-tool-input'
import { installAgentToolSnapshots } from './agent-tool-snapshots'

const names = ['shell', 'list', 'read_skill_file', 'read_skill_file', 'read_skill_file']
const calls = names.map((name, index) => ({ name, id: `call-${index}`, args: { index } }))
const channelName = 'agent_test_channel'
const State = Annotation.Root({
    [channelName]: Annotation<{ messages: BaseMessage[] }>({
        default: () => ({ messages: [] }),
        reducer: (before, after) => ({ messages: messagesStateReducer(before.messages, after.messages) })
    })
})
const inputSchema = z.object({ toolCall: z.object({ id: z.string(), args: z.object({ index: z.number() }) }) })

function fixture(mode: 'normal' | 'static' | 'dynamic' | 'retry' | 'failure' | 'abort' = 'normal', legacy = false) {
    const saver = new MemorySaver()
    const executed: string[] = []
    const attempts = new Map<string, number>()
    const controller = new AbortController()
    let active = 0,
        peak = 0
    const builder = new StateGraph<typeof State.spec, typeof State.State, Partial<typeof State.State>, string>(State)
        .addNode('model', () => ({
            [channelName]: {
                messages: [
                    new AIMessageChunk({
                        id: 'ai-original',
                        content: '',
                        tool_call_chunks: calls.map((call, index) => ({
                            ...call,
                            index,
                            args: JSON.stringify(call.args)
                        }))
                    })
                ]
            }
        }))
        .addEdge(START, 'model')
    for (const name of new Set(names)) {
        builder
            .addNode(
                name,
                async (packet, config) => {
                    const { toolCall } = inputSchema.parse(resolveAgentToolInput(packet, config))
                    const attempt = (attempts.get(toolCall.id) ?? 0) + 1
                    attempts.set(toolCall.id, attempt)
                    if (mode === 'dynamic' && toolCall.id === 'call-3') expect(interrupt('approve')).toBe('approved')
                    if (mode === 'retry' && toolCall.id === 'call-1' && attempt === 1) throw new Error('retry once')
                    if (mode === 'failure' && toolCall.id === 'call-0') throw new Error('tool failed')
                    if (mode === 'abort' && toolCall.id === 'call-0') controller.abort()
                    active++
                    peak = Math.max(peak, active)
                    await new Promise((resolve) => setTimeout(resolve, 2))
                    active--
                    executed.push(toolCall.id)
                    return {
                        [channelName]: { messages: [new ToolMessage({ content: 'OK', tool_call_id: toolCall.id })] }
                    }
                },
                {
                    retryPolicy: {
                        maxAttempts: 2,
                        initialInterval: 1,
                        jitter: false,
                        retryOn: (error) => error.message === 'retry once'
                    }
                }
            )
            .addEdge(name, END)
    }
    builder.addConditionalEdges(
        'model',
        (state, config) =>
            legacy
                ? calls.map((toolCall) => new Send(toolCall.name, { ...state, toolCall }))
                : routeAgentToolCalls(calls, state, new Set(names), 'unknown', config),
        [...new Set(names)]
    )
    const graph = installAgentToolSnapshots(
        builder.compile({ checkpointer: saver, interruptBefore: mode === 'static' ? ['read_skill_file'] : [] })
    )
    const config = {
        configurable: { thread_id: `${mode}-${legacy}` },
        version: 'v2' as const,
        signal: controller.signal
    }
    async function consume(input: Parameters<typeof graph.streamEvents>[0]) {
        for await (const event of graph.streamEvents(input, config)) {
            void event
        }
    }
    return { graph, saver, config, consume, executed, attempts, peak: () => peak }
}

describe('tool scheduling and approval checkpoints (#1251)', () => {
    it('drains all five calls with the official default scheduler and no duplicates', async () => {
        const f = fixture()
        await f.consume({})
        const state = await f.graph.getState(f.config)
        expect(f.executed).toHaveLength(5)
        expect(new Set(f.executed)).toEqual(new Set(calls.map((call) => call.id)))
        expect(f.config).not.toHaveProperty('maxConcurrency')
        expect(f.peak()).toBe(5)
        expect(state.next).toEqual([])
        expect(state.tasks).toEqual([])
    })

    it.each([false, true])(
        'resolves repeated calls at static approval and resumes once (legacy=%s)',
        async (legacy) => {
            const f = fixture('static', legacy)
            await f.consume({})
            const state = await f.graph.getState(f.config)
            expect(state.tasks.every((task) => task.interrupts.length === 0)).toBe(true)
            const tasks = toolApprovalTasks(state, f.graph.interruptBefore)
            expect(tasks).toHaveLength(3)
            const saved = await f.saver.getTuple(state.config)
            expect(tasks.map((task) => findToolCallOrigin(state.values, task, saved.checkpoint)?.toolCall.id)).toEqual([
                'call-2',
                'call-3',
                'call-4'
            ])
            await f.consume(null)
            expect(f.executed).toEqual(calls.map((call) => call.id))
            expect((await f.graph.getState(f.config)).tasks).toEqual([])
        }
    )

    it('resolves a real dynamic approval after partial tool writes', async () => {
        const f = fixture('dynamic')
        await f.consume({})
        const state = await f.graph.getState(f.config)
        expect(state.values[channelName].messages.at(-1).getType()).toBe('tool')
        const tasks = toolApprovalTasks(state, f.graph.interruptBefore)
        expect(tasks).toHaveLength(1)
        const saved = await f.saver.getTuple(state.config)
        const origin = findToolCallOrigin(state.values, tasks[0], saved.checkpoint)
        expect(origin.message.id).toBe('ai-original')
        expect(origin.toolCall).toMatchObject({ id: 'call-3', args: { index: 3 } })
        await f.consume(new Command({ resume: 'approved' }))
        expect(f.executed).toHaveLength(5)
        expect(new Set(f.executed).size).toBe(5)
        expect((await f.graph.getState(f.config)).next).toEqual([])
    })

    it('preserves retries without dropping the remaining queue', async () => {
        const f = fixture('retry')
        await f.consume({})
        expect(f.attempts.get('call-1')).toBe(2)
        expect(f.executed).toHaveLength(5)
        expect(new Set(f.executed)).toEqual(new Set(calls.map((call) => call.id)))
    })

    it.each(['failure', 'abort'] as const)('propagates %s instead of reporting successful completion', async (mode) => {
        const f = fixture(mode)
        await expect(f.consume({})).rejects.toThrow()
        expect(f.attempts.get('call-0')).toBe(1)
    })
})
