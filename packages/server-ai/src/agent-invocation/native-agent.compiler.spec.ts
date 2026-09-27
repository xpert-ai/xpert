jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { AIMessage } from '@langchain/core/messages'
import { END, InMemoryStore, START, StateGraph } from '@langchain/langgraph'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ChatMessageEventTypeEnum, IXpertAgentExecution } from '@xpert-ai/contracts'
import { Subscriber } from 'rxjs'
import { AgentStateAnnotation } from '../shared/agent/state'
import { XpertAgentSubgraphCommand } from '../xpert-agent/commands/subgraph.command'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution/commands'
import { NativeAgentCompiler } from './native-agent.compiler'

describe('Native Agent execution tool correlation', () => {
    it.each([true, false])('records the parent call only for tool-driven runs (isTool=%s)', async (isTool) => {
        const events: MessageEvent[] = []
        const subscriber = new Subscriber<MessageEvent>({
            next: (event) => {
                events.push(event)
            },
            error: () => undefined,
            complete: () => undefined
        })
        let execution: Partial<IXpertAgentExecution> = {}
        const graph = {
            invoke: jest.fn(async () => ({ messages: [new AIMessage('Done')] })),
            getState: jest.fn(async () => ({ config: { configurable: { checkpoint_id: 'checkpoint' } } }))
        }
        const execute = jest.fn(async (command: unknown) => {
            if (command instanceof XpertAgentSubgraphCommand) return { graph, nextNodes: [] }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                execution = { ...execution, ...command.execution, id: 'child' }
                return execution
            }
            throw new Error('Unexpected command')
        })
        const compiler = new NativeAgentCompiler(
            { execute } as unknown as CommandBus,
            { execute: jest.fn(async () => execution) } as unknown as QueryBus
        )
        const controller = new AbortController()
        const compiled = await compiler.compile(
            { key: 'worker', name: 'Worker' },
            {
                xpert: { id: 'assistant' },
                mute: [],
                store: new InMemoryStore(),
                subscriber,
                isDraft: false,
                options: { leaderKey: 'leader', isDraft: false, subscriber },
                thread_id: 'thread',
                rootController: controller,
                signal: controller.signal,
                isTool,
                partners: []
            }
        )
        const entryGraph = new StateGraph(AgentStateAnnotation)
            .addNode('worker', compiled.stateGraph)
            .addEdge(START, 'worker')
            .addEdge('worker', END)
            .compile()
        await entryGraph.invoke(
            {
                messages: [],
                // A workflow may inherit stale toolCall state. It must not claim that call.
                toolCall: { id: 'parent-call', name: 'worker', args: { input: 'Do work' } }
            },
            {
                configurable: { executionId: 'parent', agentKey: 'leader', thread_id: 'thread' }
            }
        )
        expect(execution).toMatchObject({
            parentId: 'parent',
            metadata: { invocationKind: 'sub_agent' }
        })
        expect(execution.metadata?.sourceToolCallId).toBe(isTool ? 'parent-call' : undefined)
        for (const event of [ChatMessageEventTypeEnum.ON_AGENT_START, ChatMessageEventTypeEnum.ON_AGENT_END]) {
            expect(events).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            event,
                            data: expect.objectContaining({
                                parentId: 'parent',
                                metadata: expect.objectContaining({
                                    invocationKind: 'sub_agent',
                                    sourceToolCallId: isTool ? 'parent-call' : undefined
                                })
                            })
                        })
                    })
                ])
            )
        }
    })
})
