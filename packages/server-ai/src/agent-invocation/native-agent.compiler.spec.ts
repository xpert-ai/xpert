jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { END, InMemoryStore, START, StateGraph } from '@langchain/langgraph'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ChatMessageEventTypeEnum, IXpertAgentExecution } from '@xpert-ai/contracts'
import { Subscriber } from 'rxjs'
import { AgentStateAnnotation } from '../shared/agent/state'
import { XpertAgentSubgraphCommand } from '../xpert-agent/commands/subgraph.command'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution/commands'
import { ExecutionControlStore } from '../execution-control/execution-control.store'
import { NativeAgentCompiler } from './native-agent.compiler'

describe('Native Agent execution tool correlation', () => {
    it.each(
        [true, false].flatMap((isTool) => [undefined, 'blocked', 'accepted'].map((outcome) => ({ isTool, outcome })))
    )(
        'preserves correlation and explicit business outcome (isTool=$isTool, outcome=$outcome)',
        async ({ isTool, outcome }) => {
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
                invoke: jest.fn(async (_state: typeof AgentStateAnnotation.State) => ({
                    messages: [
                        ...(outcome
                            ? [
                                  new ToolMessage({
                                      content: 'receipt',
                                      tool_call_id: 'receipt',
                                      artifact: {
                                          type: 'agent_execution_outcome',
                                          executionId: 'child',
                                          outcome: {
                                              status: outcome,
                                              accepted: outcome === 'accepted',
                                              subjectId: 'subject'
                                          }
                                      }
                                  })
                              ]
                            : []),
                        new AIMessage('Done')
                    ]
                })),
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
            const runAttached = jest.fn((_child: string, _parent: string, run: () => Promise<unknown>) => run())
            const compiler = new NativeAgentCompiler(
                { execute } as unknown as CommandBus,
                { execute: jest.fn(async () => execution) } as unknown as QueryBus,
                { runAttached } as unknown as ExecutionControlStore
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
            const result = await entryGraph.invoke(
                {
                    messages: [],
                    human: { input: 'parent', selectedSkillIds: [], selectedSkillWorkspaceId: 'parent-workspace' },
                    // A workflow may inherit stale toolCall state. It must not claim that call.
                    toolCall: {
                        id: 'parent-call',
                        name: 'worker',
                        args: { input: 'Do work', taskId: 'task', selectedSkillIds: ['caller-only'] }
                    }
                },
                {
                    configurable: { executionId: 'parent', agentKey: 'leader', thread_id: 'thread' }
                }
            )
            if (outcome) {
                expect(execution.metadata?.businessOutcome).toEqual({
                    status: outcome,
                    accepted: outcome === 'accepted',
                    subjectId: 'subject'
                })
                if (isTool)
                    expect(JSON.parse(String(result.messages.at(-1)?.content))).toMatchObject({
                        businessOutcome: execution.metadata.businessOutcome,
                        assistantMessage: 'Done'
                    })
                expect(events.at(-1)).toMatchObject({
                    data: { data: { metadata: { businessOutcome: execution.metadata.businessOutcome } } }
                })
            } else {
                expect(execution.metadata?.businessOutcome).toBeUndefined()
                expect(result.messages.at(-1)?.content).toBe('Done')
            }
            expect(runAttached).toHaveBeenCalledWith('child', 'parent', expect.any(Function))
            expect(graph.invoke).toHaveBeenCalledTimes(1)
            const child = graph.invoke.mock.calls[0][0]
            expect(child).not.toHaveProperty('selectedSkillIds')
            if (isTool) expect(child).toMatchObject({ taskId: 'task', human: { input: 'Do work' } })
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
        }
    )
})
