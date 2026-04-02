jest.mock('isolated-vm', () => ({
    ExternalCopy: class ExternalCopy {},
    Isolate: class Isolate {}
}))

jest.mock('@metad/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn(),
        currentUserId: jest.fn(),
        currentUser: jest.fn()
    }
}))

jest.mock('@metad/copilot', () => ({
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
        mergeRuntimeContextWithEnv: actual.mergeRuntimeContextWithEnv
    }
})

jest.mock('../../../shared', () => ({
    getWorkspace: jest.fn(),
    VolumeClient: class VolumeClient {
        static getWorkspacePath = jest.fn()
        static getWorkspaceUrl = jest.fn()

        getVolumePath(workspace?: string) {
            return workspace ? `/volume/${workspace}` : '/volume'
        }
    },
    ExecutionCancelService: class ExecutionCancelService {}
}))

jest.mock('../../../knowledgebase', () => ({
    KnowledgebaseTaskService: class KnowledgebaseTaskService {},
    KnowledgeTaskServiceQuery: class KnowledgeTaskServiceQuery {}
}))

import { RequestContext } from '@metad/server-core'
import { I18nService } from 'nestjs-i18n'
import { Observable } from 'rxjs'
import { Command } from '@langchain/langgraph'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'
import { VolumeClient, ExecutionCancelService } from '../../../shared'

describe('XpertAgentInvokeHandler', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let checkpointSaver: { getCopilotCheckpoint: jest.Mock }
    let envService: { findOne: jest.Mock }
    let i18nService: { t: jest.Mock }
    let executionCancelService: { register: jest.Mock; unregister: jest.Mock }
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

        handler = new XpertAgentInvokeHandler(
            commandBus as any,
            queryBus as any,
            checkpointSaver as any,
            envService as any,
            i18nService as unknown as I18nService,
            executionCancelService as unknown as ExecutionCancelService
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
        jest.spyOn(VolumeClient, 'getWorkspacePath').mockResolvedValue('/tmp/workspace')
        jest.spyOn(VolumeClient, 'getWorkspaceUrl').mockReturnValue('/workspace/')
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
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
                user_email: 'user@example.com'
            })
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
                    language: 'en-US'
                })
            }
        })
    })

    it('replays from checkpoint without sending a fresh graph input', async () => {
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
                    checkpointId: 'checkpoint-parent',
                    context: {
                        source: 'run-create',
                        env: {
                            existing: 'value'
                        }
                    },
                    environment: {
                        variables: [
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
                        workspaceId: 'workspace-1'
                    }
                }
            }
        })
        expect(graph.streamEvents.mock.calls[0][0]).toMatchObject({
            update: {
                sys: expect.objectContaining({
                    soul: '# Rules',
                    profile: '# Profile',
                    language: 'en-US'
                })
            }
        })
    })
})

function createGraph() {
    return {
        streamEvents: jest.fn().mockReturnValue(
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

async function consumeStream(stream: Observable<unknown>) {
    await new Promise<void>((resolve, reject) => {
        stream.subscribe({
            error: reject,
            complete: () => resolve()
        })
    })
}
