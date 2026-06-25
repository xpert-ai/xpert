jest.mock('isolated-vm', () => ({
    ExternalCopy: class ExternalCopy {},
    Isolate: class Isolate {}
}))

let mockServerCoreRequestContextActive = false

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn(),
        currentUserId: jest.fn(),
        currentUser: jest.fn()
    },
    runWithRequestContext: jest.fn((_request: unknown, next: () => unknown) => {
        mockServerCoreRequestContextActive = true
        const result = next()
        if (result && typeof Reflect.get(Object(result), 'then') === 'function') {
            return (result as Promise<unknown>).finally(() => {
                mockServerCoreRequestContextActive = false
            })
        }
        mockServerCoreRequestContextActive = false
        return result
    })
}))

jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')
    return {
        ...actual,
        runWithRequestContext: jest.fn((_request: unknown, _response: unknown, next: () => unknown) => next())
    }
})

jest.mock('@xpert-ai/copilot', () => ({
    AgentRecursionLimit: 25,
    isNil: (value: unknown) => value == null
}))

jest.mock('../../../copilot-checkpoint', () => ({
    CopilotCheckpointSaver: class CopilotCheckpointSaver {},
    GetCopilotCheckpointsByParentQuery: class GetCopilotCheckpointsByParentQuery {
        constructor(...args: unknown[]) {
            Object.assign(this, { args })
        }
    }
}))

jest.mock('../../agent', () => ({
    createMapStreamEvents: () => (event: unknown) => event
}))

jest.mock('../../../environment', () => {
    const actual = jest.requireActual('../../../environment/utils')

    return {
        EnvironmentService: class EnvironmentService {},
        getContextEnvState: actual.getContextEnvState,
        mergeEnvironmentWithEnvState: actual.mergeEnvironmentWithEnvState,
        mergeRuntimeContextWithEnv: actual.mergeRuntimeContextWithEnv
    }
})

jest.mock('../../../shared', () => ({
    getWorkspace: jest.fn(),
    isPlanModeEnabledFromState: (state: any) => state?.human?.planMode === true,
    XpertWorkAreaResolver: class XpertWorkAreaResolver {},
    VolumeClient: class VolumeClient {
        static getWorkspacePath = jest.fn()
        static getWorkspaceUrl = jest.fn()
        static getSharedWorkspacePath = jest.fn()
        static getSharedWorkspaceUrl = jest.fn()
        static getXpertWorkspacePath = jest.fn()
        static getXpertWorkspaceUrl = jest.fn()

        getVolumePath(workspace?: string) {
            return workspace ? `/volume/${workspace}` : '/volume'
        }
    },
    ExecutionCancelService: class ExecutionCancelService {}
}))

jest.mock('../../../chat-message/chat-message.entity', () => ({
    ChatMessage: class ChatMessage {}
}))

jest.mock('../../../knowledgebase', () => ({
    KnowledgebaseTaskService: class KnowledgebaseTaskService {},
    KnowledgeTaskServiceQuery: class KnowledgeTaskServiceQuery {}
}))

import { RequestContext } from '@xpert-ai/server-core'
import { I18nService } from 'nestjs-i18n'
import { Observable, Subscriber } from 'rxjs'
import { Command } from '@langchain/langgraph'
import { InMemoryStore } from '@langchain/langgraph-checkpoint'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import type { IXpertAgentExecution } from '@xpert-ai/contracts'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'
import { ExecutionCancelService, XpertWorkAreaResolver } from '../../../shared'
import { SandboxAcquireBackendCommand } from '../../../sandbox/commands'

describe('XpertAgentInvokeHandler', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let checkpointSaver: { getCopilotCheckpoint: jest.Mock }
    let envService: { findOne: jest.Mock }
    let i18nService: { t: jest.Mock }
    let executionCancelService: { register: jest.Mock; unregister: jest.Mock }
    let chatMessageRepository: { find: jest.Mock; save: jest.Mock }
    let workAreaResolver: { resolve: jest.Mock }
    let handler: XpertAgentInvokeHandler

    beforeEach(() => {
        commandBus = {
            execute: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }
        checkpointSaver = {
            getCopilotCheckpoint: jest.fn().mockResolvedValue({
                checkpoint: null,
                pendingWrites: []
            })
        }
        envService = {
            findOne: jest.fn()
        }
        i18nService = {
            t: jest.fn()
        }
        executionCancelService = {
            register: jest.fn(),
            unregister: jest.fn()
        }
        workAreaResolver = {
            resolve: jest.fn((input) => createTestWorkArea(input))
        }
        chatMessageRepository = {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockResolvedValue(undefined)
        }

        handler = new XpertAgentInvokeHandler(
            commandBus as any,
            queryBus as any,
            checkpointSaver as any,
            envService as any,
            i18nService as unknown as I18nService,
            executionCancelService as unknown as ExecutionCancelService,
            workAreaResolver as unknown as XpertWorkAreaResolver,
            chatMessageRepository as any
        )
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue({
            id: 'user-1',
            email: 'user@example.com',
            timeZone: 'Asia/Shanghai',
            preferredLanguage: 'en-US'
        } as any)
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('passes plan mode into graph compilation when human input enables it', async () => {
        const graph = createGraph()
        let compileCommand: CompileGraphCommand | null = null

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                compileCommand = command
                return createCompiledGraph(graph)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'Plan this change',
                        planMode: true
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {}
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: {
                        next: jest.fn()
                    },
                    store: null
                } as any
            )
        )

        await consumeStream(stream)

        expect(compileCommand).not.toBeNull()
        expect(compileCommand!.options.planMode).toBe(true)
    })

    it('preserves soul and profile in fresh graph input sys state', async () => {
        const graph = createGraph()

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'Original prompt'
                    },
                    sys: {
                        soul: '# Rules',
                        profile: '# Profile'
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {}
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: {
                        next: jest.fn()
                    },
                    store: null
                } as any
            )
        )

        await consumeStream(stream)

        expect(graph.streamEvents).toHaveBeenCalledTimes(1)
        expect(graph.streamEvents.mock.calls[0][0]).toMatchObject({
            sys: expect.objectContaining({
                soul: '# Rules',
                profile: '# Profile',
                language: 'en-US',
                user_email: 'user@example.com',
                thread_id: 'thread-1',
                workspace_path: '/tmp/xpert-workspace',
                workspace_url: '/xpert-workspace',
                workspace_root: '/tmp/xpert-workspace',
                shared_workspace_path: '/tmp/xpert-workspace/shared',
                memory_workspace_path: '/tmp/xpert-workspace/.xpert/memory',
                volume: '/tmp/xpert-workspace'
            })
        })
        expect(graph.streamEvents.mock.calls[0][1]).toMatchObject({
            recursionLimit: 1000
        })
        expect(workAreaResolver.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'user-1',
            provider: undefined,
            xpertId: 'xpert-1',
            projectId: undefined,
            conversationId: undefined,
            environmentId: undefined
        })
    })

    it('keeps server request context active while graph events are iterated', async () => {
        const contextStates: boolean[] = []
        const graph = createGraph(
            (async function* () {
                contextStates.push(mockServerCoreRequestContextActive)
                yield { event: 'on_chain_stream', data: {} }
            })()
        )

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })

        const invokeOptions: ConstructorParameters<typeof XpertAgentInvokeCommand>[3] = {
            isDraft: true,
            thread_id: 'thread-1',
            execution: {
                id: 'execution-1',
                threadId: 'thread-1'
            } as IXpertAgentExecution,
            rootExecutionId: 'execution-1',
            subscriber: new Subscriber<MessageEvent>({
                next: jest.fn(),
                error: jest.fn(),
                complete: jest.fn()
            }),
            store: new InMemoryStore()
        }

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'run with context'
                    }
                },
                'agent-1',
                {
                    id: 'xpert-1'
                },
                invokeOptions
            )
        )

        await consumeStream(stream)

        expect(contextStates).toEqual([true])
    })

    it('merges soul and profile into resume command updates', async () => {
        const graph = createGraph()

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    sys: {
                        soul: '# Rules',
                        profile: '# Profile'
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {}
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    resume: {
                        decision: {
                            type: 'confirm'
                        }
                    },
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: {
                        next: jest.fn()
                    },
                    store: null
                } as any
            )
        )

        await consumeStream(stream)

        expect(graph.streamEvents).toHaveBeenCalledTimes(1)
        expect(graph.streamEvents.mock.calls[0][0]).toBeInstanceOf(Command)
        expect(graph.streamEvents.mock.calls[0][0]).toMatchObject({
            update: {
                sys: expect.objectContaining({
                    soul: '# Rules',
                    profile: '# Profile',
                    language: 'en-US',
                    thread_id: 'thread-1',
                    workspace_path: '/tmp/xpert-workspace',
                    workspace_url: '/xpert-workspace',
                    volume: '/tmp/xpert-workspace'
                })
            }
        })
    })

    it('replays from checkpoint without sending a fresh graph input', async () => {
        const graph = createGraph()
        let compileCommand: CompileGraphCommand | null = null

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                compileCommand = command
                return createCompiledGraph(graph)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'Original prompt'
                    },
                    sys: {
                        soul: '# Rules',
                        profile: '# Profile'
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {}
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    checkpointId: 'checkpoint-parent',
                    context: {
                        source: 'run-create',
                        env: {
                            existing: 'value',
                            oidc_token: 'request-token'
                        }
                    },
                    environment: {
                        variables: [
                            {
                                name: 'oidc_token',
                                value: '',
                                type: 'secret'
                            },
                            {
                                name: 'workspaceId',
                                value: 'workspace-1',
                                type: 'secret'
                            }
                        ]
                    },
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: {
                        next: jest.fn()
                    },
                    store: null
                } as any
            )
        )

        await consumeStream(stream)

        expect(graph.streamEvents).toHaveBeenCalledTimes(1)
        expect(graph.streamEvents.mock.calls[0][0]).toBeInstanceOf(Command)
        expect(graph.streamEvents.mock.calls[0][1]).toMatchObject({
            configurable: {
                thread_id: 'thread-1',
                checkpoint_id: 'checkpoint-parent',
                context: {
                    source: 'run-create',
                    env: {
                        existing: 'value',
                        oidc_token: 'request-token',
                        workspaceId: 'workspace-1'
                    }
                }
            }
        })
        expect(compileCommand?.options.environment?.variables).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'oidc_token',
                    value: 'request-token'
                })
            ])
        )
        expect(graph.streamEvents.mock.calls[0][0]).toMatchObject({
            update: {
                sys: expect.objectContaining({
                    soul: '# Rules',
                    profile: '# Profile',
                    language: 'en-US',
                    thread_id: 'thread-1',
                    workspace_path: '/tmp/xpert-workspace',
                    workspace_url: '/xpert-workspace',
                    volume: '/tmp/xpert-workspace'
                })
            }
        })
    })

    it('uses the xpert workspace root as sandbox working directory', async () => {
        const graph = createGraph()

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof SandboxAcquireBackendCommand) {
                return {
                    provider: 'local-shell-sandbox',
                    workingDirectory: '/tmp/xpert-workspace'
                }
            }
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'Original prompt'
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {
                        sandbox: {
                            enabled: true,
                            provider: 'local-shell-sandbox'
                        }
                    }
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: {
                        next: jest.fn()
                    },
                    store: null
                } as any
            )
        )

        await consumeStream(stream)

        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    provider: 'local-shell-sandbox',
                    tenantId: 'tenant-1',
                    workingDirectory: '/tmp/xpert-workspace',
                    workFor: {
                        type: 'user',
                        id: 'user-1'
                    }
                })
            })
        )
    })

    it('fails sandbox-enabled invocation when backend acquire fails', async () => {
        const graph = createGraph()

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof SandboxAcquireBackendCommand) {
                throw new Error('No strategy found for type docker-sandbox')
            }
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })

        await expect(
            handler.execute(
                new XpertAgentInvokeCommand(
                    {
                        human: {
                            input: 'Original prompt'
                        }
                    } as unknown as ConstructorParameters<typeof XpertAgentInvokeCommand>[0],
                    'agent-1',
                    {
                        id: 'xpert-1',
                        features: {
                            sandbox: {
                                enabled: true,
                                provider: 'docker-sandbox'
                            }
                        }
                    } as unknown as ConstructorParameters<typeof XpertAgentInvokeCommand>[2],
                    {
                        isDraft: true,
                        thread_id: 'thread-1',
                        execution: {
                            id: 'execution-1',
                            threadId: 'thread-1'
                        },
                        rootExecutionId: 'execution-1',
                        subscriber: {
                            next: jest.fn()
                        },
                        store: null
                    } as unknown as ConstructorParameters<typeof XpertAgentInvokeCommand>[3]
                )
            )
        ).rejects.toThrow('No strategy found for type docker-sandbox')

        expect(commandBus.execute.mock.calls.some(([command]) => command instanceof CompileGraphCommand)).toBe(false)
    })

    it('uses the mapped environment workspace when sandboxEnvironmentId is provided', async () => {
        const graph = createGraph()

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof SandboxAcquireBackendCommand) {
                return {
                    provider: 'local-shell-sandbox',
                    workingDirectory: '/tmp/xpert-workspace'
                }
            }
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'Use the shared environment'
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {
                        sandbox: {
                            enabled: true,
                            provider: 'local-shell-sandbox'
                        }
                    }
                } as any,
                {
                    isDraft: true,
                    sandboxEnvironmentId: 'sandbox-env-1',
                    thread_id: 'thread-1',
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: {
                        next: jest.fn()
                    },
                    store: null
                } as any
            )
        )

        await consumeStream(stream)

        expect(workAreaResolver.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'user-1',
            provider: 'local-shell-sandbox',
            xpertId: 'xpert-1',
            projectId: undefined,
            conversationId: undefined,
            environmentId: 'sandbox-env-1'
        })
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    provider: 'local-shell-sandbox',
                    tenantId: 'tenant-1',
                    workingDirectory: '/tmp/xpert-workspace',
                    workFor: {
                        type: 'environment',
                        id: 'sandbox-env-1'
                    }
                })
            })
        )
    })

    it('does not consume pending steer follow-ups from chat model start events and passes root execution context', async () => {
        const graph = createGraph(
            (async function* () {
                yield {
                    event: 'on_chat_model_start',
                    metadata: {
                        langgraph_node: 'agent-2'
                    }
                }
            })()
        )
        const subscriber = {
            next: jest.fn()
        }

        chatMessageRepository.find.mockResolvedValueOnce([
            {
                id: 'db-message-1',
                content: 'steer input',
                followUpMode: 'steer',
                followUpStatus: 'pending',
                targetExecutionId: 'execution-1',
                conversationId: 'conversation-1'
            }
        ])

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'Original prompt'
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {}
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    conversationId: 'conversation-1',
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber,
                    store: null
                } as any
            )
        )

        await consumeStream(stream)

        expect(graph.updateState).not.toHaveBeenCalled()
        expect(graph.streamEvents).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                configurable: expect.objectContaining({
                    executionId: 'execution-1',
                    rootExecutionId: 'execution-1',
                    agentKey: 'agent-1',
                    rootAgentKey: 'agent-1'
                })
            })
        )
        expect(chatMessageRepository.save).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'db-message-1',
                    followUpMode: 'queue'
                })
            ])
        )
        expect(subscriber.next).not.toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    event: ChatMessageEventTypeEnum.ON_CHAT_EVENT
                })
            })
        )
    })

    it('downgrades stale steer follow-ups to queue when the run completes without another model call', async () => {
        const graph = createGraph()

        chatMessageRepository.find.mockResolvedValueOnce([
            {
                id: 'db-message-2',
                followUpMode: 'steer',
                followUpStatus: 'pending',
                targetExecutionId: 'execution-1',
                conversationId: 'conversation-1'
            }
        ])

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: {
                        input: 'Original prompt'
                    }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    features: {}
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    conversationId: 'conversation-1',
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: {
                        next: jest.fn()
                    },
                    store: null
                } as any
            )
        )

        await consumeStream(stream)

        expect(chatMessageRepository.save).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'db-message-2',
                    followUpMode: 'queue'
                })
            ])
        )
    })
})

function createGraph(streamEvents?: AsyncGenerator<unknown>) {
    return {
        streamEvents: jest.fn().mockReturnValue(
            streamEvents ??
                (async function* () {
                    //
                })()
        ),
        getState: jest.fn().mockResolvedValue({
            config: {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: '',
                    checkpoint_id: 'checkpoint-new'
                }
            },
            parentConfig: {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: ''
                }
            },
            values: {},
            tasks: []
        }),
        updateState: jest.fn().mockResolvedValue(undefined)
    }
}

function createCompiledGraph(graph: ReturnType<typeof createGraph>) {
    return {
        graph,
        agent: {
            key: 'agent-1',
            team: {
                id: 'team-1',
                agentConfig: {}
            }
        },
        xpertGraph: {
            nodes: []
        }
    }
}

function createTestWorkArea(input: {
    tenantId: string
    userId: string
    provider?: string | null
    xpertId?: string | null
    projectId?: string | null
    conversationId?: string | null
    environmentId?: string | null
}) {
    const workspacePath = '/tmp/xpert-workspace'
    const workspaceUrl = '/xpert-workspace'
    const volumeScope = input.environmentId
        ? {
              tenantId: input.tenantId,
              catalog: 'environment',
              environmentId: input.environmentId,
              userId: input.userId
          }
        : input.projectId
          ? {
                tenantId: input.tenantId,
                catalog: 'projects',
                projectId: input.projectId,
                userId: input.userId
            }
          : {
                tenantId: input.tenantId,
                catalog: 'xperts',
                xpertId: input.xpertId,
                userId: input.userId,
                isolateByUser: false
            }

    return {
        volumeScope,
        workspaceBinding: {
            volumeRoot: '/tmp/xpert-workspace',
            workspaceRoot: '/tmp/xpert-workspace',
            workspacePath
        },
        workingDirectory: workspacePath,
        volumePath: '/tmp/xpert-workspace',
        workspaceRoot: '/tmp/xpert-workspace',
        workspaceUrl,
        sharedPath: input.environmentId
            ? undefined
            : {
                  serverPath: '/tmp/xpert-workspace/shared',
                  workspacePath: '/tmp/xpert-workspace/shared',
                  publicUrl: '/xpert-workspace/shared'
              },
        agentPath:
            input.projectId && input.xpertId
                ? {
                      serverPath: `/tmp/xpert-workspace/agents/${input.xpertId}`,
                      workspacePath: `/tmp/xpert-workspace/agents/${input.xpertId}`,
                      publicUrl: `/xpert-workspace/agents/${input.xpertId}`
                  }
                : undefined,
        sessionPath:
            input.projectId && input.conversationId
                ? {
                      serverPath: `/tmp/xpert-workspace/sessions/${input.conversationId}`,
                      workspacePath: `/tmp/xpert-workspace/sessions/${input.conversationId}`,
                      publicUrl: `/xpert-workspace/sessions/${input.conversationId}`
                  }
                : undefined,
        memoryPath:
            !input.environmentId && !input.projectId
                ? {
                      serverPath: '/tmp/xpert-workspace/.xpert/memory',
                      workspacePath: '/tmp/xpert-workspace/.xpert/memory',
                      publicUrl: '/xpert-workspace/.xpert/memory'
                  }
                : undefined
    }
}

async function consumeStream(stream: Observable<unknown>) {
    await new Promise<void>((resolve, reject) => {
        stream.subscribe({
            error: reject,
            complete: () => resolve()
        })
    })
}
