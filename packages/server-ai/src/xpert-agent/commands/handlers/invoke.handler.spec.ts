import {
    createInvokeHarness,
    createGraph,
    createCompiledGraph,
    createTestWorkArea,
    consumeStream
} from './invoke.test-fixture'
import { Observable, Subscriber } from 'rxjs'
import { createMapStreamEvents } from '../../agent'
import { Command, getConfig } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'
import { SandboxAcquireBackendCommand } from '../../../sandbox/commands'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { CompleteToolCallsQuery } from '../../queries'
import { getExecutionContext } from '../../../shared/agent/execution-context'

describe('XpertAgentInvokeHandler', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let checkpointSaver: { getCopilotCheckpoint: jest.Mock }
    let envService: { findOne: jest.Mock }
    let i18nService: { t: jest.Mock }
    let executionCancelService: { check: jest.Mock; register: jest.Mock; unregister: jest.Mock }
    let chatMessageRepository: { find: jest.Mock; save: jest.Mock }
    let workAreaResolver: { resolve: jest.Mock }
    let createHandler: ReturnType<typeof createInvokeHarness>['createHandler']
    let handler: XpertAgentInvokeHandler

    beforeEach(() => {
        const fixtures = createInvokeHarness()
        ;({
            commandBus,
            queryBus,
            checkpointSaver,
            envService,
            i18nService,
            executionCancelService,
            workAreaResolver,
            chatMessageRepository,
            handler,
            createHandler
        } = fixtures)
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
                    workspaceDataScope: 'user',
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

    it('streams compiled external agents while still respecting explicit mute rules', async () => {
        const graph = createGraph()
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof CompileGraphCommand) {
                command.options.unmutes.push(['Agent_external', 'expert-1'], ['Agent_muted', 'expert-2'])
                command.options.mute.push(['expert-2', 'Agent_muted'])
                return createCompiledGraph(graph)
            }
            return null
        })
        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                { human: { input: 'Delegate review' } },
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
        await consumeStream(stream)
        expect(createMapStreamEvents).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ unmutes: [['Agent_external', 'expert-1']] })
        )
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
                    workspaceDataScope: 'user',
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
            workspaceDataScope: 'user',
            projectId: undefined,
            conversationId: undefined,
            environmentId: undefined
        })
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
        const sandbox = {
            provider: 'local-shell-sandbox',
            workingDirectory: '/tmp/xpert-workspace'
        }
        graph.streamEvents.mockImplementation((_input, config) => {
            expect(config.context).toBe(getConfig().context)
            expect(config.context).toBe(getExecutionContext())
            expect(getExecutionContext()?.sandbox).toBe(sandbox)
            return (async function* () {
                await Promise.resolve()
                expect(getExecutionContext()?.sandbox).toBe(sandbox)
            })()
        })

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof SandboxAcquireBackendCommand) {
                return sandbox
            }
            if (command instanceof CompileGraphCommand) {
                expect(getConfig().context).toBe(getExecutionContext())
                expect(getConfig().context?.sandbox).toBe(sandbox)
                expect(getExecutionContext()?.sandbox).toBe(sandbox)
                expect(command.options).not.toHaveProperty('sandbox')
                return createCompiledGraph(graph)
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                expect(getExecutionContext()?.sandbox).toBe(sandbox)
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

        expect(graph.streamEvents).not.toHaveBeenCalled()
        expect(getExecutionContext()).toBeUndefined()
        await consumeStream(stream)
        expect(getExecutionContext()).toBeUndefined()

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

    it.each([undefined, 'docker-sandbox'])(
        'maps file paths with the acquired provider (configured: %s)',
        async (provider) => {
            const graph = createGraph()
            workAreaResolver.resolve.mockImplementation((input) => {
                const area = createTestWorkArea(input)
                return input.provider === 'docker-sandbox'
                    ? {
                          ...area,
                          workspaceRoot: '/workspace',
                          workingDirectory: '/workspace',
                          sharedPath: { ...area.sharedPath, workspacePath: '/workspace/shared' },
                          memoryPath: { ...area.memoryPath, workspacePath: '/workspace/.xpert/memory' }
                      }
                    : area
            })
            commandBus.execute.mockImplementation(async (command: unknown) => {
                if (command instanceof SandboxAcquireBackendCommand)
                    return { provider: 'docker-sandbox', workingDirectory: '/workspace' }
                if (command instanceof CompileGraphCommand) {
                    expect(command.options.workspaceRoot).toBe('/workspace')
                    expect(command.options.workspacePath).toBe('/workspace')
                    return createCompiledGraph(graph)
                }
                return null
            })
            const stream = await handler.execute(
                new XpertAgentInvokeCommand(
                    { human: { input: 'Write and register a workspace script' } },
                    'agent-1',
                    {
                        id: 'xpert-1',
                        workspaceDataScope: 'user',
                        features: {
                            sandbox: { enabled: true, provider },
                            opener: { enabled: false, message: '', questions: [] },
                            suggestion: { enabled: false, prompt: '' },
                            textToSpeech: { enabled: false },
                            speechToText: { enabled: false }
                        }
                    },
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
            await consumeStream(stream)
            expect(graph.streamEvents.mock.calls[0][0]).toMatchObject({
                sys: {
                    volume: '/tmp/xpert-workspace',
                    workspace_root: '/workspace',
                    workspace_path: '/workspace',
                    shared_workspace_path: '/workspace/shared',
                    memory_workspace_path: '/workspace/.xpert/memory'
                }
            })
            expect(workAreaResolver.resolve).toHaveBeenCalledTimes(provider ? 1 : 2)
            expect(workAreaResolver.resolve).toHaveBeenLastCalledWith(
                expect.objectContaining({ provider: 'docker-sandbox', xpertId: 'xpert-1' })
            )
        }
    )

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
            workspaceDataScope: undefined,
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
        const completionOrder: string[] = []

        chatMessageRepository.find.mockImplementationOnce(async () => {
            completionOrder.push('drain')
            return [
                {
                    id: 'db-message-2',
                    followUpMode: 'steer',
                    followUpStatus: 'pending',
                    targetExecutionId: 'execution-1',
                    conversationId: 'conversation-1'
                }
            ]
        })

        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            if (
                command instanceof XpertAgentExecutionUpsertCommand &&
                command.execution.status === XpertAgentExecutionStatusEnum.SUCCESS
            ) {
                completionOrder.push('status')
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

        expect(completionOrder).toEqual(['status', 'drain'])
        expect(chatMessageRepository.save).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'db-message-2',
                    followUpMode: 'queue'
                })
            ])
        )
    })

    it('passes the active Project to interrupted tool-call completion', async () => {
        const graph = createGraph()
        const sandbox = { provider: 'local-shell-sandbox', backend: { id: 'approval-backend' } }
        const completionScopes: ReturnType<typeof getExecutionContext>[] = []
        graph.getState.mockResolvedValue({
            config: {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: '',
                    checkpoint_id: 'checkpoint-new'
                }
            },
            parentConfig: null,
            values: {},
            next: ['search'],
            tasks: [{ id: 'task-1', name: 'search', interrupts: [{ value: 'approve' }] }]
        })
        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof SandboxAcquireBackendCommand) return sandbox
            if (command instanceof CompileGraphCommand) {
                return createCompiledGraph(graph)
            }
            return null
        })
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof CompleteToolCallsQuery) completionScopes.push(getExecutionContext())
            return { tasks: [] }
        })

        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                {
                    human: { input: 'Run the tool' }
                } as any,
                'agent-1',
                {
                    id: 'xpert-1',
                    workspaceDataScope: 'user',
                    features: { sandbox: { enabled: true, provider: 'local-shell-sandbox' } }
                } as any,
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    projectId: 'project-1',
                    conversationId: 'conversation-1',
                    execution: {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    },
                    rootExecutionId: 'execution-1',
                    subscriber: { next: jest.fn() },
                    store: null
                } as any
            )
        )

        await consumeStream(stream).catch(() => undefined)

        const completeQuery = queryBus.execute.mock.calls.find(
            ([query]) => query instanceof CompleteToolCallsQuery
        )?.[0] as CompleteToolCallsQuery
        expect(completeQuery.projectId).toBe('project-1')
        expect(completeQuery).not.toHaveProperty('sandbox')
        expect(completionScopes).toHaveLength(1)
        expect(completionScopes[0]?.sandbox).toBe(sandbox)
    })
    it.each([
        { label: 'pause only', completedTasks: [] },
        {
            label: 'completed parallel tool',
            completedTasks: [{ id: 'done', name: 'search', interrupts: [], result: { output: 'done' } }]
        },
        { label: 'completed node without output', completedTasks: [{ id: 'done', name: 'search', interrupts: [] }] }
    ])('stages a pause snapshot with $label without creating tool approvals', async ({ completedTasks }) => {
        const graph = createGraph()
        graph.getState.mockResolvedValue({
            config: { configurable: { thread_id: 'thread-1', checkpoint_ns: '', checkpoint_id: 'saved' } },
            values: {},
            next: ['next'],
            tasks: [...completedTasks, { id: 'task', name: 'next', interrupts: [{ value: { type: 'thread_pause' } }] }]
        })
        const control = {
            ensureExecution: jest.fn(),
            requiresInputAdmission: jest.fn().mockResolvedValue(false),
            recordGraph: jest.fn().mockResolvedValue('a'.repeat(64)),
            shouldPause: jest.fn().mockResolvedValue(true),
            stageCheckpoint: jest.fn()
        }
        const controlledHandler = createHandler(control as never)

        commandBus.execute.mockImplementation(async (command) =>
            command instanceof CompileGraphCommand ? createCompiledGraph(graph) : null
        )
        const checkpoint = { threadId: 'thread-1', checkpointNs: '', checkpointId: 'paused-before' }
        const stream = await controlledHandler.execute(
            new XpertAgentInvokeCommand(
                { human: { input: 'Do not resend this' } } as never,
                'agent-1',
                { id: 'xpert-1', features: {} } as never,
                {
                    thread_id: 'thread-1',
                    execution: { id: 'execution-1', threadId: 'thread-1' },
                    subscriber: { next: jest.fn() },
                    store: null,
                    resumeCheckpoint: checkpoint
                } as never
            )
        )
        await consumeStream(stream).catch(() => undefined)
        expect(graph.streamEvents.mock.calls[0][0]).toBeNull()
        expect(graph.streamEvents.mock.calls[0][1].configurable).toMatchObject({
            xpertResumeCheckpoint: checkpoint,
            xpertGraphRevision: 'a'.repeat(64)
        })
        expect(graph.streamEvents.mock.calls[0][1].configurable.checkpoint_id).toBeUndefined()
        expect(control.stageCheckpoint).toHaveBeenCalledWith('thread-1', 'execution-1', {
            threadId: 'thread-1',
            checkpointNs: '',
            checkpointId: 'saved'
        })
        expect(queryBus.execute.mock.calls.some(([query]) => query instanceof CompleteToolCallsQuery)).toBe(false)
    })

    it('stages a pause checkpoint when the graph has no pending tasks', async () => {
        const graph = createGraph()
        graph.getState.mockResolvedValue({
            config: { configurable: { thread_id: 'thread-1', checkpoint_ns: '', checkpoint_id: 'saved' } },
            values: {},
            next: [],
            tasks: []
        })
        const control = {
            ensureExecution: jest.fn(),
            requiresInputAdmission: jest.fn().mockResolvedValue(false),
            recordGraph: jest.fn(),
            shouldPause: jest.fn().mockResolvedValue(true),
            stageCheckpoint: jest.fn()
        }
        const controlledHandler = createHandler(control as never)

        commandBus.execute.mockImplementation(async (command) =>
            command instanceof CompileGraphCommand ? createCompiledGraph(graph) : null
        )

        const stream = await controlledHandler.execute(
            new XpertAgentInvokeCommand(
                { human: { input: 'Pause after the current step' } } as never,
                'agent-1',
                { id: 'xpert-1', features: {} } as never,
                {
                    thread_id: 'thread-1',
                    execution: { id: 'execution-1', threadId: 'thread-1' },
                    subscriber: { next: jest.fn() },
                    store: null
                } as never
            )
        )

        await consumeStream(stream).catch(() => undefined)

        expect(control.stageCheckpoint).toHaveBeenCalledWith('thread-1', 'execution-1', {
            threadId: 'thread-1',
            checkpointNs: '',
            checkpointId: 'saved'
        })
        expect(queryBus.execute.mock.calls.some(([query]) => query instanceof CompleteToolCallsQuery)).toBe(false)
        expect(
            commandBus.execute.mock.calls.some(
                ([command]) =>
                    command instanceof XpertAgentExecutionUpsertCommand &&
                    command.execution.status === XpertAgentExecutionStatusEnum.SUCCESS
            )
        ).toBe(false)
    })
})
