import { createCompiledGraph, createGraph, createInvokeHarness } from './invoke.test-fixture'
import { AIMessage } from '@langchain/core/messages'
import { messageContentText } from '@xpert-ai/contracts'
import { lastValueFrom, Subscriber, toArray } from 'rxjs'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'

describe('Studio structured debug output', () => {
    it.each([
        { from: 'debugger', streamed: false, muted: false, expected: 1 },
        { from: 'debugger', streamed: true, muted: false, expected: 1 },
        { from: 'debugger', streamed: false, muted: true, expected: 0 },
        { from: 'webapp', streamed: false, muted: false, expected: 0 }
    ] as const)(
        'returns the structured debug answer once ($from, streamed=$streamed, muted=$muted)',
        async ({ from, streamed, muted, expected }) => {
            const { commandBus, handler } = createInvokeHarness()
            const output = JSON.stringify({ archiveTime: '18:00' })
            const graph = createGraph(
                (async function* () {
                    yield { type: 'reasoning', text: 'Thinking' }
                    if (streamed) yield { type: 'text', text: output }
                })()
            )
            const snapshot = await graph.getState()
            graph.getState.mockResolvedValue({
                ...snapshot,
                values: { 'agent-1_channel': { messages: [new AIMessage(output)] } }
            })

            commandBus.execute.mockImplementation(async (command) => {
                if (command instanceof CompileGraphCommand) {
                    const compiled = createCompiledGraph(graph)
                    return {
                        ...compiled,
                        agent: {
                            ...compiled.agent,
                            options: { structuredOutputMethod: 'functionCalling' },
                            team: { id: 'team-1', agentConfig: { mute: muted ? [['agent-1']] : [] } }
                        },
                        xpertGraph: { nodes: [{ type: 'agent', key: 'agent-1', entity: compiled.agent }] }
                    }
                }
            })
            const stream = await handler.execute(
                new XpertAgentInvokeCommand(
                    { human: { input: '归档时间？' } },
                    'agent-1',
                    { id: 'xpert-1' },
                    {
                        from,
                        isDraft: from === 'debugger',
                        thread_id: 'thread-1',
                        rootExecutionId: 'execution-1',
                        execution: { id: 'execution-1', threadId: 'thread-1' },
                        subscriber: new Subscriber<MessageEvent>(),
                        store: null
                    }
                )
            )
            const chunks = await lastValueFrom(stream.pipe(toArray()))
            expect(chunks.filter((chunk) => messageContentText(chunk) === output)).toHaveLength(expected)
        }
    )
})
