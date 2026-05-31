import { RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import {
    channelName,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    IEnvironment,
    IXpertAgentExecution,
    STATE_VARIABLE_HUMAN,
    STATE_VARIABLE_SYS,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { z } from 'zod'
import type { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'
import { STATE_VARIABLE_PENDING_FOLLOW_UPS } from '../../../shared'
import { CreateNodeConsumePendingSteerFollowUpsCommand } from '../create-node-consume-pending-steer-follow-ups.command'
import { CreateNodeStagePendingSteerFollowUpsCommand } from '../create-node-stage-pending-steer-follow-ups.command'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { CreateNodeConsumePendingSteerFollowUpsHandler } from './create-node-consume-pending-steer-follow-ups.handler'
import { CreateNodeStagePendingSteerFollowUpsHandler } from './create-node-stage-pending-steer-follow-ups.handler'
import { XpertAgentSubgraphHandler } from './subgraph.handler'

describe('subgraph steer follow-up pre-turn node handlers', () => {
    it('stage handler returns a runnable lambda that loads pending steer follow-ups into the staging channel', async () => {
        const chatMessageRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'db-message-1',
                    content: 'steer input',
                    thirdPartyMessage: {
                        followUpInput: {
                            input: 'steer input'
                        },
                        followUpClientMessageId: 'client-message-1'
                    },
                    attachments: []
                }
            ])
        }

        const handler = new CreateNodeStagePendingSteerFollowUpsHandler(chatMessageRepository as any)
        const node = await handler.execute(
            new CreateNodeStagePendingSteerFollowUpsCommand({
                conversationId: 'conversation-1'
            })
        )

        expect(node).toBeInstanceOf(RunnableLambda)

        const result = await node.invoke(
            {} as any,
            {
                configurable: {
                    executionId: 'child-execution-1',
                    rootExecutionId: 'execution-1'
                }
            } as any
        )

        expect(chatMessageRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    conversationId: 'conversation-1',
                    targetExecutionId: 'execution-1',
                    followUpMode: 'steer',
                    followUpStatus: 'pending'
                })
            })
        )
        expect(result).toEqual({
            [STATE_VARIABLE_PENDING_FOLLOW_UPS]: [
                {
                    messageId: 'db-message-1',
                    clientMessageId: 'client-message-1',
                    human: {
                        input: 'steer input'
                    }
                }
            ]
        })
    })

    it('consume handler returns a runnable lambda that consumes staged steer follow-ups', async () => {
        const subscriber = {
            next: jest.fn()
        }
        const chatMessageRepository = {
            save: jest.fn().mockResolvedValue(undefined)
        }
        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn()
        }

        const handler = new CreateNodeConsumePendingSteerFollowUpsHandler(
            commandBus as any,
            queryBus as any,
            chatMessageRepository as any
        )
        const node = await handler.execute(
            new CreateNodeConsumePendingSteerFollowUpsCommand({
                agentKey: 'agent-2',
                agentChannel: channelName('agent-2'),
                subscriber: subscriber as any
            })
        )

        expect(node).toBeInstanceOf(RunnableLambda)

        const result = await node.invoke(
            {
                [STATE_VARIABLE_SYS]: {
                    language: 'en-US'
                },
                [STATE_VARIABLE_PENDING_FOLLOW_UPS]: [
                    {
                        messageId: 'db-message-1',
                        clientMessageId: 'client-message-1',
                        human: {
                            input: 'steer input 1',
                            files: [
                                {
                                    id: 'file-1'
                                }
                            ] as any,
                            references: [
                                {
                                    type: 'quote',
                                    text: 'ref-1'
                                }
                            ],
                            custom: 'early'
                        }
                    },
                    {
                        messageId: 'db-message-2',
                        clientMessageId: 'client-message-2',
                        human: {
                            input: 'steer input 2',
                            files: [
                                {
                                    id: 'file-2'
                                }
                            ] as any,
                            references: [
                                {
                                    type: 'quote',
                                    text: 'ref-2'
                                }
                            ],
                            custom: 'late'
                        }
                    }
                ]
            } as any,
            {
                configurable: {
                    executionId: 'child-execution-1',
                    rootExecutionId: 'execution-1',
                    rootAgentKey: 'agent-1'
                }
            } as any
        )

        expect(result).toEqual(
            expect.objectContaining({
                input: 'steer input 1\n\nsteer input 2',
                [STATE_VARIABLE_HUMAN]: {
                    input: 'steer input 1\n\nsteer input 2',
                    files: [
                        expect.objectContaining({
                            id: 'file-1'
                        }),
                        expect.objectContaining({
                            id: 'file-2'
                        })
                    ],
                    references: [
                        expect.objectContaining({
                            type: 'quote',
                            text: 'ref-1'
                        }),
                        expect.objectContaining({
                            type: 'quote',
                            text: 'ref-2'
                        })
                    ],
                    custom: 'late'
                },
                [STATE_VARIABLE_PENDING_FOLLOW_UPS]: [],
                messages: [
                    expect.objectContaining({
                        content: 'steer input 1\n\nsteer input 2'
                    })
                ],
                [channelName('agent-1')]: {
                    messages: [
                        expect.objectContaining({
                            content: 'steer input 1\n\nsteer input 2'
                        })
                    ]
                },
                [channelName('agent-2')]: {
                    messages: [
                        expect.objectContaining({
                            content: 'steer input 1\n\nsteer input 2'
                        })
                    ]
                }
            })
        )
        expect(chatMessageRepository.save).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'db-message-1',
                    followUpStatus: 'consumed'
                }),
                expect.objectContaining({
                    id: 'db-message-2',
                    followUpStatus: 'consumed'
                })
            ])
        )
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: ChatMessageTypeEnum.EVENT,
                    event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                    data: expect.objectContaining({
                        type: 'follow_up_consumed',
                        mode: 'steer',
                        executionId: 'execution-1',
                        clientMessageIds: ['client-message-1', 'client-message-2']
                    })
                })
            })
        )
    })
})

describe('XpertAgentSubgraphHandler hidden agent graph', () => {
    it('does not register unreachable model tool nodes for hidden agents', async () => {
        const graph = {
            nodes: [
                {
                    type: 'agent',
                    key: 'agent-1',
                    entity: {
                        key: 'agent-1',
                        name: 'Hidden Agent',
                        title: 'Hidden Agent',
                        toolsetIds: [],
                        knowledgebaseIds: [],
                        options: {
                            hidden: true
                        },
                        team: {
                            id: 'xpert-1',
                            workspaceId: 'workspace-1',
                            agentConfig: {}
                        }
                    }
                },
                {
                    type: 'workflow',
                    key: 'trigger-1',
                    entity: {
                        key: 'trigger-1',
                        type: WorkflowNodeTypeEnum.TRIGGER,
                        from: 'chat'
                    }
                }
            ],
            connections: []
        }
        const commandBus = {
            execute: jest.fn(async (command) => {
                if (command.constructor.name === 'ToolsetGetToolsCommand') {
                    return []
                }

                if (command.constructor.name === 'CreateWorkflowNodeCommand') {
                    return {
                        workflowNode: {
                            graph: RunnableLambda.from(() => ({})),
                            ends: []
                        },
                        nextNodes: []
                    }
                }

                throw new Error(`Unexpected command: ${command.constructor.name}`)
            })
        }
        const queryBus = {
            execute: jest.fn(async (command) => {
                if (command.constructor.name === 'GetXpertWorkflowQuery') {
                    return {
                        agent: graph.nodes[0].entity,
                        graph,
                        next: [],
                        fail: []
                    }
                }

                throw new Error(`Unexpected query: ${command.constructor.name}`)
            })
        }
        const handler = new XpertAgentSubgraphHandler(
            null,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            null,
            null,
            {
                api: {}
            } as unknown as AgentMiddlewareRuntimeService
        )
        Object.defineProperty(handler, 'agentMiddlewareRegistry', {
            value: {
                get: jest.fn().mockReturnValue({
                    createMiddleware: jest.fn().mockReturnValue({
                        name: 'ClientToolMiddleware',
                        tools: [
                            tool(async () => '', {
                                name: 'file_search',
                                description: 'Search files.',
                                schema: z.object({
                                    query: z.string()
                                })
                            })
                        ]
                    })
                })
            }
        })

        await expect(
            handler.execute(
                new XpertAgentSubgraphCommand(
                    'agent-1',
                    {
                        id: 'xpert-1',
                        workspaceId: 'workspace-1'
                    },
                    {
                        isStart: true,
                        isDraft: true,
                        mute: [],
                        store: null,
                        subscriber: null,
                        execution: {
                            id: 'execution-1'
                        } as IXpertAgentExecution,
                        rootController: new AbortController(),
                        signal: new AbortController().signal,
                        channel: channelName('agent-1'),
                        thread_id: 'thread-1',
                        environment: {
                            variables: []
                        } as IEnvironment
                    }
                )
            )
        ).resolves.toEqual(
            expect.objectContaining({
                graph: expect.any(Object)
            })
        )
    })
})
