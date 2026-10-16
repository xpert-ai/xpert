jest.mock('../../../chat-conversation/message-checkpoint.service', () => ({ MessageCheckpointService: class {} }))
jest.mock('../../../chat-conversation/thread-run-control.service', () => ({
    ThreadRunControlService: class {},
    threadGraphRevision: () => 'graph-v1'
}))
jest.mock('isolated-vm', () => ({ ExternalCopy: class {}, Isolate: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: () => 'tenant-1',
        getOrganizationId: () => 'org-1',
        currentUserId: () => 'user-1',
        currentUser: () => ({ id: 'user-1', preferredLanguage: 'en-US' })
    },
    RedisEphemeralService: class {}
}))
jest.mock('../../../copilot-checkpoint', () => ({
    CopilotCheckpointSaver: class {},
    GetCopilotCheckpointsByParentQuery: class {}
}))
jest.mock('../../agent', () => ({ createMapStreamEvents: () => (event: unknown) => event }))
jest.mock('../../../environment', () => ({
    EnvironmentService: class {},
    ...jest.requireActual('../../../environment/utils')
}))
jest.mock('../../../shared', () => ({
    isPlanModeEnabledFromState: () => false,
    XpertWorkAreaResolver: class {},
    ExecutionCancelService: class {}
}))
jest.mock('../../../chat-message/chat-message.entity', () => ({ ChatMessage: class {} }))
jest.mock('../../../knowledgebase', () => ({ KnowledgebaseTaskService: class {}, KnowledgeTaskServiceQuery: class {} }))

import { Subject, Subscriber } from 'rxjs'
import { SandboxExecutionLeaseService } from '../../../sandbox/sandbox-execution-lease.service'
import { SandboxAcquireBackendCommand } from '../../../sandbox/commands'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'

describe('Agent invocation sandbox retention', () => {
    let touchActivity: jest.Mock
    let releaseActivity: jest.Mock
    let handler: XpertAgentInvokeHandler
    let graphEvents: Subject<string>
    let compile: jest.Mock
    let command: XpertAgentInvokeCommand
    let executionCancel: { register: jest.Mock; unregister: jest.Mock }

    beforeEach(() => {
        touchActivity = jest.fn().mockResolvedValue(undefined)
        releaseActivity = jest.fn().mockResolvedValue(undefined)
        const leases = new SandboxExecutionLeaseService({ touchActivity, releaseActivity } as never)
        executionCancel = { register: jest.fn(), unregister: jest.fn() }
        graphEvents = new Subject<string>()
        compile = jest.fn(async () => ({
            graph: {
                streamEvents: () => graphEvents,
                getState: async () => ({
                    values: {},
                    tasks: [],
                    next: [],
                    config: {
                        configurable: { thread_id: 'thread-1', checkpoint_ns: '', checkpoint_id: 'checkpoint-1' }
                    }
                })
            },
            agent: { key: 'agent-1', team: { id: 'team-1', agentConfig: {} } },
            xpertGraph: { nodes: [] }
        }))
        handler = new XpertAgentInvokeHandler(
            {
                execute: jest.fn(async (command: unknown) => {
                    if (command instanceof SandboxAcquireBackendCommand) {
                        return {
                            provider: 'docker-sandbox',
                            containerId: 'container-a',
                            workingDirectory: '/workspace'
                        }
                    }
                    return command instanceof CompileGraphCommand ? compile() : null
                })
            } as never,
            { execute: jest.fn() } as never,
            { getCopilotCheckpoint: async () => ({ checkpoint: null, pendingWrites: [] }) } as never,
            { findOne: jest.fn() } as never,
            { t: jest.fn() } as never,
            executionCancel as never,
            {
                resolve: async () => ({
                    volumeScope: { tenantId: 'tenant-1', catalog: 'user-xperts', userId: 'user-1', xpertId: 'xpert-1' },
                    workspaceBinding: {
                        volumeRoot: '/sandbox/user-1/xpert-1',
                        workspaceRoot: '/workspace',
                        workspacePath: '/workspace'
                    },
                    volumePath: '/sandbox/user-1/xpert-1',
                    workingDirectory: '/workspace',
                    workspaceRoot: '/workspace'
                })
            } as never,
            undefined,
            { find: async () => [], save: jest.fn() } as never,
            leases
        )
        command = new XpertAgentInvokeCommand(
            { human: { input: 'Run the task' } },
            'agent-1',
            {
                id: 'xpert-1',
                features: {
                    sandbox: { enabled: true, provider: 'docker-sandbox' },
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
            } as never
        )
    })

    it('retains the acquired container before graph compilation and releases it after success', async () => {
        compile.mockImplementationOnce(async () => {
            expect(touchActivity).toHaveBeenCalledWith('sandbox:container-a', expect.any(String), expect.any(Number))
            return compile.getMockImplementation()!()
        })
        const stream = await handler.execute(command)
        const completed = new Promise<void>((resolve, reject) => stream.subscribe({ complete: resolve, error: reject }))
        expect(releaseActivity).not.toHaveBeenCalled()
        graphEvents.complete()
        await completed
        await Promise.resolve()
        expect(releaseActivity).toHaveBeenCalledWith('sandbox:container-a', touchActivity.mock.calls[0][1])
    })

    it('releases the acquired container when graph compilation fails', async () => {
        compile.mockRejectedValueOnce(new Error('Compile failed'))
        await expect(handler.execute(command)).rejects.toThrow('Compile failed')
        expect(releaseActivity).toHaveBeenCalledWith('sandbox:container-a', touchActivity.mock.calls[0][1])
        expect(executionCancel.unregister).toHaveBeenCalledWith('execution-1')
    })

    it('releases retention when execution cancellation arrives while graph compilation is pending', async () => {
        let finishCompile: () => void = () => {
            throw new Error('Compilation not started')
        }
        let startedCompile: () => void = () => undefined
        const compilationStarted = new Promise<void>((resolve) => {
            startedCompile = resolve
        })
        compile.mockImplementationOnce(() =>
            new Promise<void>((resolve) => {
                finishCompile = resolve
                startedCompile()
            }).then(() => compile.getMockImplementation()!())
        )
        const invocation = handler.execute(command)
        const canceled = expect(invocation).rejects.toMatchObject({ name: 'AbortError' })
        await compilationStarted
        const controller: AbortController = executionCancel.register.mock.calls[0][1]
        controller.abort()
        await Promise.resolve()
        expect(releaseActivity).toHaveBeenCalledWith('sandbox:container-a', touchActivity.mock.calls[0][1])
        finishCompile()
        await canceled
        expect(executionCancel.unregister).toHaveBeenCalledWith('execution-1')
    })

    it('releases the acquired container when the client cancels a model wait', async () => {
        const stream = await handler.execute(command)
        stream.subscribe().unsubscribe()
        await Promise.resolve()
        expect(releaseActivity).toHaveBeenCalledWith('sandbox:container-a', touchActivity.mock.calls[0][1])
    })
})
