jest.mock('yargs', () => ({
    __esModule: true,
    default: () => ({
        argv: {}
    })
}))

import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { tool } from '@langchain/core/tools'
import { Logger } from '@nestjs/common'
import {
    channelName,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    IEnvironment,
    IXpert,
    IXpertAgent,
    IXpertAgentExecution,
    STATE_VARIABLE_HUMAN,
    STATE_VARIABLE_SYS,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { z } from 'zod'
import type { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime/index'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FILE_UNDERSTANDING_MIDDLEWARE_NAME } from '../../../file-understanding/middlewares'
import { setModelVisionSupport } from '../../../copilot-model/model-capabilities'
import { STATE_VARIABLE_PENDING_FOLLOW_UPS } from '../../../shared/agent/state'
import { CreateNodeConsumePendingSteerFollowUpsCommand } from '../create-node-consume-pending-steer-follow-ups.command'
import { CreateNodeStagePendingSteerFollowUpsCommand } from '../create-node-stage-pending-steer-follow-ups.command'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { CreateNodeConsumePendingSteerFollowUpsHandler } from './create-node-consume-pending-steer-follow-ups.handler'
import { CreateNodeStagePendingSteerFollowUpsHandler } from './create-node-stage-pending-steer-follow-ups.handler'
import { getCurrentExecutionId, XpertAgentSubgraphHandler } from './subgraph.handler'

describe('XpertAgentSubgraphHandler invocation execution id', () => {
    it('resolves the current execution id between concurrent sub-agent calls', async () => {
        type ChildGraphConfig = {
            configurable?: {
                executionId?: string
            }
        }

        const observedExecutions: Array<{ expected?: string; actual?: string }> = []
        let startedInvocations = 0
        let releaseInvocations: (() => void) | undefined
        const allInvocationsStarted = new Promise<void>((resolve) => {
            releaseInvocations = resolve
        })
        const childGraph = {
            getState: jest.fn(async () => ({
                config: {
                    configurable: {
                        checkpoint_id: 'checkpoint-1'
                    }
                }
            })),
            invoke: jest.fn(async (_state: unknown, invokeConfig: ChildGraphConfig) =>
                AsyncLocalStorageProviderSingleton.runWithConfig(invokeConfig, async () => {
                    startedInvocations += 1
                    if (startedInvocations === 2) {
                        releaseInvocations?.()
                    }
                    await allInvocationsStarted
                    observedExecutions.push({
                        expected: invokeConfig.configurable?.executionId,
                        actual: getCurrentExecutionId()
                    })
                    return {
                        messages: [new AIMessage(`result-${invokeConfig.configurable?.executionId}`)]
                    }
                })
            )
        }
        let executionSequence = 0
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof XpertAgentSubgraphCommand) {
                    return {
                        graph: childGraph,
                        nextNodes: [],
                        failNode: undefined
                    }
                }
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    if (!command.execution.id) {
                        executionSequence += 1
                        return {
                            ...command.execution,
                            id: `child-execution-${executionSequence}`
                        }
                    }
                    return command.execution
                }
                throw new Error(`Unexpected command: ${command?.constructor.name}`)
            })
        }
        const queryBus = {
            execute: jest.fn(async (query: unknown) => {
                if (query instanceof XpertAgentExecutionOneQuery) {
                    return { id: query.id }
                }
                throw new Error(`Unexpected query: ${query?.constructor.name}`)
            })
        }
        const handler = new XpertAgentSubgraphHandler(
            null,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            null,
            null,
            {
                createScopedApi: jest.fn().mockReturnValue({}),
                resolveSelectedConnectorRuntimeBindings: jest.fn().mockResolvedValue([])
            } as unknown as AgentMiddlewareRuntimeService,
            { findOne: jest.fn(async (id: string) => ({ id })) } as never
        )
        const subscriber = {
            next: jest.fn()
        }
        const subAgent = await handler.createAgentSubgraph(
            {
                key: 'agent-2',
                name: 'Agent 2',
                description: 'Concurrent sub-agent'
            } as IXpertAgent,
            {
                xpert: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1'
                },
                options: {
                    leaderKey: 'agent-1',
                    isDraft: true,
                    subscriber
                },
                thread_id: 'thread-1',
                rootController: new AbortController(),
                signal: new AbortController().signal,
                isTool: true,
                partners: [],
                mute: [],
                store: null,
                subscriber,
                isDraft: true
            } as unknown as Parameters<XpertAgentSubgraphHandler['createAgentSubgraph']>[1]
        )

        const invoke = (callId: string) =>
            subAgent.stateGraph?.invoke(
                {
                    messages: [],
                    toolCall: {
                        id: callId,
                        name: 'agent-2',
                        args: { input: callId }
                    }
                },
                {
                    configurable: {
                        executionId: 'parent-execution',
                        thread_id: 'thread-1',
                        checkpoint_ns: ''
                    }
                }
            )

        await Promise.all([invoke('call-1'), invoke('call-2')])

        expect(observedExecutions).toHaveLength(2)
        expect(observedExecutions).toEqual(
            expect.arrayContaining([
                { expected: 'child-execution-1', actual: 'child-execution-1' },
                { expected: 'child-execution-2', actual: 'child-execution-2' }
            ])
        )
    })
})

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
            execute: jest.fn().mockResolvedValue([])
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

        const expectedMessageContent = ['steer input 1', '', 'Referenced content:', '[Quoted text]', '> ref-1'].join(
            '\n'
        )
        const getMessageContent = (message: unknown) => {
            if (!message || typeof message !== 'object') {
                return undefined
            }
            if ('content' in message && typeof message.content === 'string') {
                return message.content
            }
            if ('content' in message && Array.isArray(message.content)) {
                return message.content
                    .map((part) =>
                        part && typeof part === 'object' && 'text' in part && typeof part.text === 'string'
                            ? part.text
                            : ''
                    )
                    .filter(Boolean)
                    .join('\n')
            }
            if ('kwargs' in message && message.kwargs && typeof message.kwargs === 'object') {
                if ('content' in message.kwargs && typeof message.kwargs.content === 'string') {
                    return message.kwargs.content
                }
            }
            return undefined
        }
        const getChannelMessages = (channelState: unknown) => {
            if (!channelState || typeof channelState !== 'object') {
                throw new Error('Expected channel state object')
            }
            if (!('messages' in channelState) || !Array.isArray(channelState.messages)) {
                throw new Error('Expected channel state messages')
            }
            return channelState.messages
        }

        expect(result).toEqual(
            expect.objectContaining({
                input: 'steer input 1',
                [STATE_VARIABLE_HUMAN]: {
                    input: 'steer input 1',
                    files: [
                        expect.objectContaining({
                            id: 'file-1'
                        })
                    ],
                    references: [
                        expect.objectContaining({
                            type: 'quote',
                            text: 'ref-1'
                        })
                    ],
                    custom: 'early'
                },
                [STATE_VARIABLE_PENDING_FOLLOW_UPS]: [
                    expect.objectContaining({
                        messageId: 'db-message-2',
                        clientMessageId: 'client-message-2'
                    })
                ]
            })
        )
        expect(getMessageContent(result.messages[0])).toBe(expectedMessageContent)
        expect(getMessageContent(getChannelMessages(result[channelName('agent-1')])[0])).toBe(expectedMessageContent)
        expect(getMessageContent(getChannelMessages(result[channelName('agent-2')])[0])).toBe(expectedMessageContent)
        expect(chatMessageRepository.save).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'db-message-1',
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
                        clientMessageIds: ['client-message-1'],
                        messageIds: ['db-message-1']
                    })
                })
            })
        )
    })
})

describe('XpertAgentSubgraphHandler model image preparation', () => {
    function createFixture(options: {
        primarySupportsVision: boolean
        primaryError?: Error
        fallbackSupportsVision?: boolean
        middlewareReplacementSupportsVision?: boolean
        observePublicProfile?: boolean
        workspaceDataScope?: 'shared' | 'user'
        commandXpert?: Partial<IXpert>
    }) {
        const primaryInvoke = jest.fn(async (_messages: unknown) => {
            if (options.primaryError) {
                throw options.primaryError
            }
            return new AIMessage('primary response')
        })
        const primaryModel = setModelVisionSupport(RunnableLambda.from(primaryInvoke), options.primarySupportsVision)
        Object.defineProperty(primaryModel, 'metadata', {
            configurable: true,
            enumerable: true,
            value: { profile: { imageInputs: options.primarySupportsVision } }
        })
        const fallbackInvoke = jest.fn(async (_messages: unknown) => new AIMessage('fallback response'))
        const fallbackModel = setModelVisionSupport(
            RunnableLambda.from(fallbackInvoke),
            options.fallbackSupportsVision ?? false
        )
        const replacementInvoke = jest.fn(async (_messages: unknown) => new AIMessage('replacement response'))
        const replacementModel = setModelVisionSupport(
            RunnableLambda.from(replacementInvoke),
            options.middlewareReplacementSupportsVision ?? false
        )
        const configuredModels = [primaryModel, fallbackModel]
        const agent = {
            key: 'agent-1',
            name: 'Image Agent',
            prompt: 'Handle the user request.',
            toolsetIds: [],
            knowledgebaseIds: [],
            options: {
                fileUnderstanding: {
                    enabled: false
                },
                ...(options.primaryError
                    ? {
                          fallback: {
                              enabled: true,
                              copilotModel: {
                                  model: 'fallback-model'
                              }
                          }
                      }
                    : {})
            },
            team: {
                id: 'xpert-1',
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1',
                workspaceDataScope: options.workspaceDataScope ?? 'shared',
                agentConfig: {},
                copilotModel: {
                    model: 'primary-model',
                    copilot: {
                        modelProvider: {
                            providerName: 'fake-provider'
                        },
                        copilotModel: {
                            model: 'primary-model'
                        }
                    }
                }
            }
        }
        const observedModelProfiles: unknown[] = []
        const middlewareEnabled =
            options.middlewareReplacementSupportsVision !== undefined || options.observePublicProfile
        const graphDefinition = {
            nodes: [
                {
                    type: 'agent',
                    key: 'agent-1',
                    entity: agent
                },
                ...(middlewareEnabled
                    ? [
                          {
                              type: 'workflow',
                              key: 'middleware-1',
                              entity: {
                                  type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                  provider: 'test-model-replacement'
                              }
                          }
                      ]
                    : [])
            ],
            connections: middlewareEnabled
                ? [
                      {
                          type: 'workflow',
                          from: 'agent-1',
                          to: 'middleware-1'
                      }
                  ]
                : []
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                switch (command?.constructor.name) {
                    case 'ToolsetGetToolsCommand':
                        return []
                    case 'CreateNodeStagePendingSteerFollowUpsCommand':
                        return RunnableLambda.from(() => ({
                            [STATE_VARIABLE_PENDING_FOLLOW_UPS]: []
                        }))
                    case 'CreateNodeConsumePendingSteerFollowUpsCommand':
                        return RunnableLambda.from(() => ({}))
                    default:
                        throw new Error(`Unexpected command: ${command?.constructor.name}`)
                }
            })
        }
        const queryBus = {
            execute: jest.fn(async (query: unknown) => {
                switch (query?.constructor.name) {
                    case 'GetXpertWorkflowQuery':
                        return {
                            agent,
                            graph: graphDefinition,
                            next: [],
                            fail: []
                        }
                    case 'GetXpertChatModelQuery':
                        return configuredModels.shift()
                    default:
                        throw new Error(`Unexpected query: ${query?.constructor.name}`)
                }
            })
        }
        const createScopedApi = jest.fn().mockReturnValue({})
        const middlewareRuntime = {
            createScopedApi,
            resolveSelectedConnectorRuntimeBindings: jest.fn().mockResolvedValue([])
        }
        const handler = new XpertAgentSubgraphHandler(
            null,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            { t: jest.fn(), translate: jest.fn() } as never,
            null,
            middlewareRuntime as unknown as AgentMiddlewareRuntimeService,
            { findOne: jest.fn(async (id: string) => ({ id })) } as never
        )
        Object.defineProperty(handler, 'agentMiddlewareRegistry', {
            value: {
                get: jest.fn().mockReturnValue({
                    createMiddleware: jest.fn().mockReturnValue({
                        name: 'test-model-replacement',
                        wrapModelCall: (request, next) => {
                            observedModelProfiles.push('profile' in request.model ? request.model.profile : undefined)
                            return next(
                                options.middlewareReplacementSupportsVision === undefined
                                    ? request
                                    : {
                                          ...request,
                                          model: replacementModel
                                      }
                            )
                        }
                    })
                })
            }
        })

        return {
            command: new XpertAgentSubgraphCommand(
                'agent-1',
                options.commandXpert ?? {
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    workspaceId: 'workspace-1',
                    workspaceDataScope: options.workspaceDataScope ?? 'shared'
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
                    disableCheckpointer: true,
                    environment: {
                        variables: []
                    } as IEnvironment,
                    partners: []
                }
            ),
            fallbackInvoke,
            createScopedApi,
            handler,
            commandBus,
            middlewareRuntime,
            observedModelProfiles,
            primaryInvoke,
            replacementInvoke
        }
    }

    it('binds a user-scoped Xpert middleware runtime to user-xperts', async () => {
        const userSpy = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-a')
        const fixture = createFixture({
            primarySupportsVision: true,
            workspaceDataScope: 'user',
            commandXpert: { id: 'xpert-1' }
        })

        try {
            await fixture.handler.execute(fixture.command)
        } finally {
            userSpy.mockRestore()
        }

        expect(fixture.createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({
                xpertId: 'xpert-1',
                catalog: 'user-xperts',
                scopeId: 'xpert-1',
                isolateByUser: true
            })
        )
    })

    async function invokeGraph(fixture: ReturnType<typeof createFixture>) {
        const { graph } = await fixture.handler.execute(fixture.command)
        return graph.invoke(
            {
                input: 'describe the image',
                [STATE_VARIABLE_HUMAN]: {
                    input: 'describe the image'
                },
                [STATE_VARIABLE_SYS]: {
                    language: 'en-US',
                    user_email: 'user@example.com',
                    timezone: 'UTC',
                    date: '2026-07-20',
                    datetime: '2026-07-20 10:00:00',
                    common_times: ''
                },
                [channelName('agent-1')]: {
                    messages: [
                        new HumanMessage({
                            content: [
                                { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
                                { type: 'text', text: 'Describe this image' }
                            ]
                        })
                    ]
                }
            },
            {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: '',
                    checkpoint_id: 'checkpoint-1',
                    tenantId: 'tenant-1',
                    organizationId: 'organization-1',
                    language: 'en-US',
                    userId: 'user-1',
                    agentKey: 'agent-1',
                    executionId: 'execution-1'
                },
                recursionLimit: 5
            }
        )
    }

    it('filters images before invoking a text-only primary model', async () => {
        const fixture = createFixture({ primarySupportsVision: false })

        await invokeGraph(fixture)

        expect(JSON.stringify(fixture.primaryInvoke.mock.calls[0]?.[0])).not.toContain('image_url')
    })

    it('keeps images when invoking a vision primary model', async () => {
        const fixture = createFixture({ primarySupportsVision: true })

        await invokeGraph(fixture)

        expect(JSON.stringify(fixture.primaryInvoke.mock.calls[0]?.[0])).toContain('image_url')
    })

    it('preserves the provider public profile on the model wrapper exposed to middleware', async () => {
        const fixture = createFixture({
            primarySupportsVision: true,
            observePublicProfile: true
        })

        await invokeGraph(fixture)

        expect(fixture.observedModelProfiles).toEqual([{ imageInputs: true }])
    })

    it('filters images for a text-only fallback after a vision primary model fails', async () => {
        const fixture = createFixture({
            primarySupportsVision: true,
            primaryError: new Error('primary unavailable'),
            fallbackSupportsVision: false
        })

        await invokeGraph(fixture)

        expect(JSON.stringify(fixture.primaryInvoke.mock.calls[0]?.[0])).toContain('image_url')
        expect(JSON.stringify(fixture.fallbackInvoke.mock.calls[0]?.[0])).not.toContain('image_url')
    })

    it('keeps images for a vision fallback after a text-only primary model fails', async () => {
        const fixture = createFixture({
            primarySupportsVision: false,
            primaryError: new Error('primary unavailable'),
            fallbackSupportsVision: true
        })

        await invokeGraph(fixture)

        expect(JSON.stringify(fixture.primaryInvoke.mock.calls[0]?.[0])).not.toContain('image_url')
        expect(JSON.stringify(fixture.fallbackInvoke.mock.calls[0]?.[0])).toContain('image_url')
    })

    it('uses the replacement model capability when middleware changes the model', async () => {
        const fixture = createFixture({
            primarySupportsVision: true,
            middlewareReplacementSupportsVision: false
        })

        await invokeGraph(fixture)

        expect(fixture.primaryInvoke).not.toHaveBeenCalled()
        expect(JSON.stringify(fixture.replacementInvoke.mock.calls[0]?.[0])).not.toContain('image_url')
    })

    it('binds Agent toolsets and middleware to the user-Xpert execution scope', async () => {
        const userSpy = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-a')
        const fixture = createFixture({
            primarySupportsVision: true,
            workspaceDataScope: 'user',
            commandXpert: { id: 'xpert-1' }
        })

        try {
            await fixture.handler.execute(fixture.command)
        } finally {
            userSpy.mockRestore()
        }

        const getToolsCommand = fixture.commandBus.execute.mock.calls.find(
            ([command]) => command?.constructor.name === 'ToolsetGetToolsCommand'
        )?.[0] as { environment?: Record<string, unknown> }
        expect(getToolsCommand.environment?.xpertId).toBe('xpert-1')
        expect(getToolsCommand.environment?.workspaceDataScope).toBe('user')
        expect(getToolsCommand.environment).not.toHaveProperty('catalog')
        expect(getToolsCommand.environment).not.toHaveProperty('scopeId')
        expect(getToolsCommand.environment).not.toHaveProperty('isolateByUser')
        expect(fixture.middlewareRuntime.createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'user-a',
                xpertId: 'xpert-1',
                catalog: 'user-xperts',
                scopeId: 'xpert-1',
                isolateByUser: true
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
                createScopedApi: jest.fn().mockReturnValue({}),
                resolveSelectedConnectorRuntimeBindings: jest.fn().mockResolvedValue([])
            } as unknown as AgentMiddlewareRuntimeService,
            { findOne: jest.fn(async (id: string) => ({ id })) } as never
        )
        Object.defineProperty(handler, 'agentMiddlewareRegistry', {
            value: {
                get: jest.fn().mockReturnValue({
                    createMiddleware: jest.fn().mockReturnValue({
                        name: 'ClientToolMiddleware',
                        tools: [
                            tool(async () => '', {
                                name: 'parsed_file_search',
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

    it('uses the runtime trigger source as the hidden agent start node', async () => {
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
                        from: 'schedule'
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
                createScopedApi: jest.fn().mockReturnValue({}),
                resolveSelectedConnectorRuntimeBindings: jest.fn().mockResolvedValue([])
            } as unknown as AgentMiddlewareRuntimeService,
            { findOne: jest.fn(async (id: string) => ({ id })) } as never
        )
        Object.defineProperty(handler, 'agentMiddlewareRegistry', {
            value: {
                get: jest.fn().mockReturnValue({
                    createMiddleware: jest.fn().mockReturnValue({
                        name: 'ClientToolMiddleware',
                        tools: [
                            tool(async () => '', {
                                name: 'parsed_file_search',
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
                        } as IEnvironment,
                        from: 'schedule'
                    }
                )
            )
        ).resolves.toEqual(
            expect.objectContaining({
                graph: expect.any(Object)
            })
        )

        const workflowCommands = commandBus.execute.mock.calls
            .map(([command]) => command)
            .filter((command) => command.constructor.name === 'CreateWorkflowNodeCommand')
        expect(workflowCommands).toHaveLength(1)
        expect(workflowCommands[0].node.key).toBe('trigger-1')
    })
})

describe('XpertAgentSubgraphHandler file understanding middleware', () => {
    type TestGraph = {
        nodes: Array<{ entity: unknown }>
        connections: unknown[]
    }

    function createCommand(agentOptions: Partial<NonNullable<IXpertAgent['options']>> = {}) {
        const graph = {
            nodes: [
                {
                    type: 'agent',
                    key: 'agent-1',
                    entity: {
                        key: 'agent-1',
                        name: 'Agent',
                        title: 'Agent',
                        toolsetIds: [],
                        knowledgebaseIds: [],
                        options: {
                            hidden: true,
                            ...agentOptions
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
        return {
            graph,
            command: new XpertAgentSubgraphCommand(
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
                    } as IEnvironment,
                    conversationId: 'conversation-1'
                }
            )
        }
    }

    function createHandler(
        graph: TestGraph,
        registryGet = jest.fn(),
        selectedRuntimeBindings: Array<{ bindingId: string; provider: string }> = []
    ) {
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
                createScopedApi: jest.fn().mockReturnValue({}),
                resolveSelectedConnectorRuntimeBindings: jest.fn().mockResolvedValue(selectedRuntimeBindings)
            } as unknown as AgentMiddlewareRuntimeService,
            { findOne: jest.fn(async (id: string) => ({ id })) } as never
        )
        Object.defineProperty(handler, 'agentMiddlewareRegistry', {
            value: {
                get: registryGet
            }
        })
        return handler
    }

    it('creates file understanding middleware by default', async () => {
        const { graph, command } = createCommand()
        const createMiddleware = jest.fn().mockReturnValue({
            name: FILE_UNDERSTANDING_MIDDLEWARE_NAME,
            tools: [
                tool(async () => '', {
                    name: 'parsed_file_search',
                    description: 'Search files.',
                    schema: z.object({
                        query: z.string()
                    })
                })
            ]
        })
        const registryGet = jest.fn().mockReturnValue({ createMiddleware })
        const handler = createHandler(graph, registryGet)

        await handler.execute(command)

        expect(registryGet).toHaveBeenCalledWith(FILE_UNDERSTANDING_MIDDLEWARE_NAME)
        expect(createMiddleware).toHaveBeenCalledWith(
            { conversationId: 'conversation-1' },
            expect.objectContaining({
                node: expect.objectContaining({
                    provider: FILE_UNDERSTANDING_MIDDLEWARE_NAME,
                    required: true
                })
            })
        )
    })

    it('does not mount file understanding tools when the agent disables file understanding', async () => {
        const { graph, command } = createCommand({
            fileUnderstanding: {
                enabled: false
            }
        })
        const registryGet = jest.fn()
        const handler = createHandler(graph, registryGet)

        await handler.execute(command)

        expect(registryGet).not.toHaveBeenCalled()
    })

    it('does not mount file understanding tools when structured output is enabled', async () => {
        const { graph, command } = createCommand({
            structuredOutputMethod: 'jsonMode'
        })
        const registryGet = jest.fn()
        const handler = createHandler(graph, registryGet)

        await handler.execute(command)

        expect(registryGet).not.toHaveBeenCalled()
    })

    it('mounts selected Connector runtime middleware without a graph middleware node', async () => {
        const { graph, command } = createCommand({
            fileUnderstanding: {
                enabled: false
            }
        })
        command.options.runtimeCapabilities = {
            mode: 'allowlist',
            skills: { ids: [] },
            plugins: { nodeKeys: [] },
            connectors: { bindingIds: ['binding-1'] }
        }
        const createMiddleware = jest.fn().mockReturnValue({
            name: 'ConnectorRuntime:github',
            tools: []
        })
        const registryGet = jest.fn().mockReturnValue({
            meta: { name: 'ConnectorRuntime:github' },
            createMiddleware
        })
        const handler = createHandler(graph, registryGet, [{ bindingId: 'binding-1', provider: 'github' }])

        await handler.execute(command)

        expect(registryGet).toHaveBeenCalledWith('ConnectorRuntime:github', undefined)
        expect(createMiddleware).toHaveBeenCalledWith(
            { connectorId: 'binding-1' },
            expect.objectContaining({
                node: expect.objectContaining({
                    provider: 'ConnectorRuntime:github',
                    required: true
                })
            })
        )
    })
})

describe('XpertAgentSubgraphHandler invalid tool call diagnostics', () => {
    type ErrorHandlingOption = NonNullable<IXpertAgent['options']>['errorHandling']

    function constructorName(value: unknown) {
        return value && typeof value === 'object' ? value.constructor.name : ''
    }

    function createMalformedToolCallFixture(options: {
        invalidArgs: string
        errorHandling?: ErrorHandlingOption
        toolName?: string
    }) {
        const invalidMessage = new AIMessage({
            id: 'ai-invalid-1',
            content: '',
            invalid_tool_calls: [
                {
                    id: 'call-invalid-1',
                    name: options.toolName ?? 'excalidraw_create_drawing',
                    error: 'Malformed args.',
                    args: options.invalidArgs
                }
            ]
        })
        const model = RunnableLambda.from(async () => invalidMessage)
        const agent = {
            key: 'agent-1',
            name: 'Drawing Agent',
            title: 'Drawing Agent',
            prompt: 'Draw the requested diagram.',
            promptTemplates: [
                {
                    id: 'prompt-1',
                    role: 'human',
                    text: '{{input}}'
                }
            ],
            toolsetIds: [],
            knowledgebaseIds: [],
            options: {
                fileUnderstanding: {
                    enabled: false
                },
                ...(options.errorHandling ? { errorHandling: options.errorHandling } : {})
            },
            team: {
                id: 'xpert-1',
                workspaceId: 'workspace-1',
                agentConfig: {},
                copilotModel: {
                    model: 'fake-model',
                    copilot: {
                        modelProvider: {
                            providerName: 'fake-provider'
                        },
                        copilotModel: {
                            model: 'provider-model'
                        }
                    }
                }
            }
        }
        const graph = {
            nodes: [
                {
                    type: 'agent',
                    key: 'agent-1',
                    entity: agent
                }
            ],
            connections: []
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                switch (constructorName(command)) {
                    case 'ToolsetGetToolsCommand':
                        return []
                    case 'CreateWorkflowNodeCommand':
                        return {
                            workflowNode: {
                                graph: RunnableLambda.from(() => ({})),
                                ends: []
                            },
                            nextNodes: []
                        }
                    case 'CreateNodeStagePendingSteerFollowUpsCommand':
                        return RunnableLambda.from(() => ({
                            [STATE_VARIABLE_PENDING_FOLLOW_UPS]: []
                        }))
                    case 'CreateNodeConsumePendingSteerFollowUpsCommand':
                        return RunnableLambda.from(() => ({}))
                    default:
                        throw new Error(`Unexpected command: ${constructorName(command)}`)
                }
            })
        }
        const queryBus = {
            execute: jest.fn(async (query: unknown) => {
                switch (constructorName(query)) {
                    case 'GetXpertWorkflowQuery':
                        return {
                            agent,
                            graph,
                            next: [],
                            fail: []
                        }
                    case 'GetXpertChatModelQuery':
                        return model
                    default:
                        throw new Error(`Unexpected query: ${constructorName(query)}`)
                }
            })
        }
        const handler = new XpertAgentSubgraphHandler(
            null,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            null,
            null,
            {
                createScopedApi: jest.fn().mockReturnValue({}),
                resolveSelectedConnectorRuntimeBindings: jest.fn().mockResolvedValue([])
            } as unknown as AgentMiddlewareRuntimeService,
            { findOne: jest.fn(async (id: string) => ({ id })) } as never
        )
        Object.defineProperty(handler, 'agentMiddlewareRegistry', {
            value: {
                get: jest.fn()
            }
        })

        return {
            handler,
            command: new XpertAgentSubgraphCommand(
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
                    disableCheckpointer: true,
                    environment: {
                        variables: []
                    } as IEnvironment,
                    partners: []
                }
            )
        }
    }

    async function invokeMalformedGraph(fixture: ReturnType<typeof createMalformedToolCallFixture>) {
        const { graph } = await fixture.handler.execute(fixture.command)
        return graph.invoke(
            {
                input: 'draw a flowchart',
                [STATE_VARIABLE_SYS]: {
                    language: 'en-US',
                    user_email: 'user@example.com',
                    timezone: 'UTC',
                    date: '2026-06-18',
                    datetime: '2026-06-18 10:00:00',
                    common_times: ''
                }
            },
            {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: '',
                    checkpoint_id: 'checkpoint-1',
                    tenantId: 'tenant-1',
                    organizationId: 'organization-1',
                    language: 'en-US',
                    userId: 'user-1',
                    agentKey: 'agent-1',
                    executionId: 'execution-1'
                },
                recursionLimit: 5
            }
        )
    }

    function getFirstLoggedInvalidToolCall(loggerError: jest.SpyInstance) {
        const diagnostic = loggerError.mock.calls[0]?.[0]
        if (!diagnostic || typeof diagnostic !== 'object') {
            throw new Error('Expected invalid tool call diagnostic object')
        }
        const invalidToolCalls = Reflect.get(diagnostic, 'invalidToolCalls')
        if (!Array.isArray(invalidToolCalls)) {
            throw new Error('Expected invalid tool call diagnostics')
        }
        const firstCall = invalidToolCalls[0]
        if (!firstCall || typeof firstCall !== 'object') {
            throw new Error('Expected first invalid tool call diagnostic')
        }
        return firstCall
    }

    function getMessagesFromState(state: unknown, channel?: string) {
        if (!state || typeof state !== 'object') {
            throw new Error('Expected graph state object')
        }
        const container = channel ? Reflect.get(state, channel) : state
        if (!container || typeof container !== 'object') {
            throw new Error('Expected channel state object')
        }
        const messages = Reflect.get(container, 'messages')
        if (!Array.isArray(messages)) {
            throw new Error('Expected channel messages')
        }
        return messages
    }

    function getMessageContent(message: unknown) {
        if (!message || typeof message !== 'object') {
            return undefined
        }
        const content = Reflect.get(message, 'content')
        if (typeof content === 'string') {
            return content
        }
        const kwargs = Reflect.get(message, 'kwargs')
        if (kwargs && typeof kwargs === 'object') {
            const kwargsContent = Reflect.get(kwargs, 'content')
            return typeof kwargsContent === 'string' ? kwargsContent : undefined
        }
        return undefined
    }

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('logs invalid tool call diagnostics and throws a bounded args preview', async () => {
        const longArgs = `{"elements":"${'x'.repeat(10500)}","broken":BROKEN_VALUE,"tail":"${'y'.repeat(10500)}"}`
        const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        const fixture = createMalformedToolCallFixture({ invalidArgs: longArgs })

        let thrown: unknown
        try {
            await invokeMalformedGraph(fixture)
        } catch (err) {
            thrown = err
        }

        const thrownMessage = thrown instanceof Error ? thrown.message : String(thrown)
        expect(thrownMessage).toContain('excalidraw_create_drawing: Malformed args.')
        expect(thrownMessage).toContain(`Args (${longArgs.length} chars, preview truncated):`)
        expect(thrownMessage).toContain('{"elements":')
        expect(thrownMessage).toContain('Around JSON parse error at character')
        expect(thrownMessage).toContain('BROKEN_VALUE')
        expect(thrownMessage).not.toContain('Likely unescaped ASCII double quote')
        expect(thrownMessage).toContain('diagnosticId:')
        expect(thrownMessage.length).toBeLessThan(5000)
        expect(loggerError).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'xpert.invalid_tool_calls',
                diagnosticId: expect.any(String),
                threadId: 'thread-1',
                executionId: 'execution-1',
                xpertId: 'xpert-1',
                agentKey: 'agent-1',
                agentChannel: channelName('agent-1'),
                model: {
                    provider: 'fake-provider',
                    model: 'fake-model'
                },
                aiMessageId: 'ai-invalid-1',
                invalidToolCalls: [
                    expect.objectContaining({
                        id: 'call-invalid-1',
                        name: 'excalidraw_create_drawing',
                        error: 'Malformed args.',
                        rawArgsLength: longArgs.length,
                        truncated: true,
                        argsPreview: expect.stringContaining('{"elements":')
                    })
                ]
            })
        )

        const firstCall = getFirstLoggedInvalidToolCall(loggerError)
        const argsPreview = Reflect.get(firstCall, 'argsPreview')
        expect(typeof argsPreview === 'string' ? argsPreview.length : 0).toBe(20000)
    })

    it('keeps malformed AIMessage and raw args out of the failBranch channel', async () => {
        const invalidArgs = '{"elements": "bad", "password": "secret-value"'
        const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        const fixture = createMalformedToolCallFixture({
            invalidArgs,
            errorHandling: {
                type: 'failBranch'
            }
        })

        const output = await invokeMalformedGraph(fixture)
        const rootMessages = getMessagesFromState(output)
        const channelMessages = getMessagesFromState(output, channelName('agent-1'))
        const outputJson = JSON.stringify(output)
        const lastChannelMessage = channelMessages[channelMessages.length - 1]

        expect(rootMessages).toHaveLength(2)
        expect(channelMessages).toHaveLength(2)
        expect(getMessageContent(lastChannelMessage)).toContain('diagnosticId:')
        expect(getMessageContent(lastChannelMessage)).toContain('[REDACTED]')
        expect(outputJson).not.toContain(invalidArgs)
        expect(outputJson).not.toContain('secret-value')
        expect(outputJson).not.toContain('call-invalid-1')
        expect(loggerError).toHaveBeenCalledWith(
            expect.objectContaining({
                invalidToolCalls: [
                    expect.objectContaining({
                        argsPreview: expect.stringContaining('[REDACTED]')
                    })
                ]
            })
        )
    })

    it('identifies an unescaped quote and the affected JSON string field', async () => {
        const invalidArgs =
            '{"projectId":"00000000-0000-4000-8000-000000000001","episode":{"script":"孩子呼喊："救命！救命！"。"}}'
        const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        const fixture = createMalformedToolCallFixture({
            invalidArgs,
            toolName: 'story_upsert_production_episode'
        })

        let thrown: unknown
        try {
            await invokeMalformedGraph(fixture)
        } catch (err) {
            thrown = err
        }

        const thrownMessage = thrown instanceof Error ? thrown.message : String(thrown)
        expect(thrownMessage).toContain('story_upsert_production_episode: Malformed args.')
        expect(thrownMessage).toContain('Likely unescaped ASCII double quote in JSON string field "script"')
        expect(thrownMessage).toContain('use typographic quotation marks')
        expect(thrown).toEqual(
            expect.objectContaining({
                name: 'ModelOutputValidationError',
                code: 'MODEL_OUTPUT_VALIDATION_ERROR',
                retryable: true,
                repairContext: {
                    kind: 'invalid_tool_calls',
                    issues: [
                        expect.objectContaining({
                            toolName: 'story_upsert_production_episode',
                            fieldName: 'script',
                            error: 'Malformed args.',
                            characterOffset: expect.any(Number),
                            hint: expect.stringContaining('unescaped ASCII double quote')
                        })
                    ]
                }
            })
        )
        expect(JSON.stringify(Reflect.get(thrown as object, 'repairContext'))).not.toContain('孩子呼喊')
        expect(getFirstLoggedInvalidToolCall(loggerError)).toEqual(
            expect.objectContaining({
                name: 'story_upsert_production_episode',
                jsonHint: expect.stringContaining('field "script"')
            })
        )
    })
})
