import { RunnableLambda } from '@langchain/core/runnables'
import {
    channelName,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    STATE_VARIABLE_HUMAN,
    STATE_VARIABLE_SYS
} from '@xpert-ai/contracts'
import { STATE_VARIABLE_PENDING_FOLLOW_UPS } from '../../../shared'
import { CreateNodeConsumePendingSteerFollowUpsCommand } from '../create-node-consume-pending-steer-follow-ups.command'
import { CreateNodeStagePendingSteerFollowUpsCommand } from '../create-node-stage-pending-steer-follow-ups.command'
import { CreateNodeConsumePendingSteerFollowUpsHandler } from './create-node-consume-pending-steer-follow-ups.handler'
import { CreateNodeStagePendingSteerFollowUpsHandler } from './create-node-stage-pending-steer-follow-ups.handler'

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
            {},
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
                            input: 'steer input 1'
                        }
                    },
                    {
                        messageId: 'db-message-2',
                        clientMessageId: 'client-message-2',
                        human: {
                            input: 'steer input 2'
                        }
                    }
                ]
            },
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
                    input: 'steer input 1\n\nsteer input 2'
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

