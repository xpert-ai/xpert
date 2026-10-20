jest.mock('../../../chat-conversation/message-checkpoint.service', () => ({ MessageCheckpointService: class {} }))
jest.mock('../../../chat-conversation/thread-run-control.service', () => ({
    ThreadRunControlService: class {},
    threadGraphRevision: () => 'graph-v1'
}))
jest.mock('isolated-vm', () => ({ ExternalCopy: class {}, Isolate: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext
}))
jest.mock('../../../copilot-checkpoint', () => ({ CopilotCheckpointSaver: class {} }))
jest.mock('../../agent', () => ({ createMapStreamEvents: () => (event: unknown) => event }))
jest.mock('../../../environment', () => ({
    ...jest.requireActual('../../../environment/utils'),
    EnvironmentService: class {}
}))
jest.mock('../../../shared', () => ({
    isPlanModeEnabledFromState: () => false,
    ExecutionCancelService: class {},
    XpertWorkAreaResolver: class {}
}))
jest.mock('../../../chat-message/chat-message.entity', () => ({ ChatMessage: class {} }))
jest.mock('../../../knowledgebase', () => ({ KnowledgebaseTaskService: class {}, KnowledgeTaskServiceQuery: class {} }))

import { Logger } from '@nestjs/common'
import { RequestContext, SandboxExecutionRetention } from '@xpert-ai/plugin-sdk'
import { Subscriber } from 'rxjs'
import { SandboxAcquireBackendCommand } from '../../../sandbox/commands'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}

function fixture() {
    const release = jest.fn(async () => {})
    const started = deferred<AbortSignal>()
    const completion = deferred<void>()
    const backend = {
        id: 'sandbox',
        execute: jest.fn(),
        retainExecution: jest.fn(async (_options: SandboxExecutionRetention) => release)
    }
    const graph = {
        streamEvents: jest.fn((_input: unknown, options: { signal: AbortSignal }) =>
            (async function* () {
                const abort = () => completion.reject(options.signal.reason)
                options.signal.addEventListener('abort', abort, { once: true })
                started.resolve(options.signal)
                try {
                    await completion.promise
                    yield { event: 'model-finished' }
                } finally {
                    options.signal.removeEventListener('abort', abort)
                }
            })()
        ),
        getState: jest.fn().mockResolvedValue({
            config: { configurable: { thread_id: 'thread', checkpoint_ns: '', checkpoint_id: 'checkpoint' } },
            values: {},
            tasks: [],
            next: []
        })
    }
    const cancel = { register: jest.fn(), unregister: jest.fn() }
    const commandBus = {
        execute: jest.fn(async (command: unknown) => {
            if (command instanceof SandboxAcquireBackendCommand)
                return {
                    provider: 'docker-sandbox',
                    environmentId: 'environment',
                    containerId: 'container-b',
                    workingDirectory: '/workspace',
                    backend
                }
            if (command instanceof CompileGraphCommand)
                return {
                    graph,
                    agent: { key: 'agent', team: { id: 'team', agentConfig: {} } },
                    xpertGraph: { nodes: [] }
                }
            return null
        })
    }
    const handler = new XpertAgentInvokeHandler(
        commandBus as never,
        { execute: jest.fn().mockResolvedValue([]) } as never,
        { getCopilotCheckpoint: jest.fn().mockResolvedValue({ checkpoint: null, pendingWrites: [] }) } as never,
        undefined,
        undefined,
        cancel as never,
        {
            resolve: async () => ({
                volumeScope: { tenantId: 'tenant', catalog: 'xperts', xpertId: 'assistant', userId: 'user' },
                workspaceBinding: { volumeRoot: '/volume', workspaceRoot: '/workspace', workspacePath: '/workspace' },
                workingDirectory: '/workspace',
                volumePath: '/volume',
                workspaceRoot: '/workspace',
                workspaceUrl: '/files'
            })
        } as never,
        undefined,
        { find: jest.fn().mockResolvedValue([]) } as never
    )
    const command = () =>
        new XpertAgentInvokeCommand(
            { human: { input: 'Think before the next tool call' } },
            'agent',
            {
                id: 'assistant',
                features: {
                    opener: { enabled: false, message: '', questions: [] },
                    suggestion: { enabled: false, prompt: '' },
                    textToSpeech: { enabled: false },
                    speechToText: { enabled: false },
                    sandbox: { enabled: true, provider: 'docker-sandbox' }
                }
            },
            {
                isDraft: false,
                thread_id: 'thread',
                rootExecutionId: 'execution',
                execution: { id: 'execution', threadId: 'thread' },
                subscriber: new Subscriber<MessageEvent>(),
                store: null
            }
        )
    return {
        release,
        backend,
        graph,
        cancel,
        commandBus,
        handler,
        command,
        started,
        completion
    }
}

describe('Agent sandbox retention contract', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user', preferredLanguage: 'en-US' })
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    })
    afterEach(() => {
        jest.restoreAllMocks()
        jest.useRealTimers()
    })

    it('retains a capable backend throughout model-only waiting and releases it when the graph completes', async () => {
        const f = fixture()
        const stream = await f.handler.execute(f.command())
        const finished = deferred<void>()
        stream.subscribe({ complete: () => finished.resolve(), error: finished.reject })
        const signal = await f.started.promise
        expect(f.backend.retainExecution).toHaveBeenCalledTimes(1)
        expect(f.backend.retainExecution.mock.calls[0][0]).toMatchObject({ executionId: 'execution', signal })

        await jest.advanceTimersByTimeAsync(10 * 60_000)
        expect(signal.aborted).toBe(false)
        expect(f.release).not.toHaveBeenCalled()

        f.completion.resolve()
        await finished.promise
        await jest.advanceTimersByTimeAsync(0)
        expect(signal.aborted).toBe(true)
        expect(f.release).toHaveBeenCalledTimes(1)
        expect(f.cancel.unregister).toHaveBeenCalledWith('execution')
    })

    it.each(['stream-error', 'unsubscribe', 'cancel', 'lease-lost'] as const)(
        'releases the owner and aborts the graph on %s',
        async (ending) => {
            const f = fixture()
            const stream = await f.handler.execute(f.command())
            const errors: unknown[] = []
            const subscription = stream.subscribe({ error: (error) => errors.push(error) })
            const signal = await f.started.promise
            if (ending === 'stream-error') f.completion.reject(new Error('model failed'))
            if (ending === 'unsubscribe') {
                subscription.unsubscribe()
                f.completion.resolve()
            }
            if (ending === 'cancel') {
                const controller: AbortController = f.cancel.register.mock.calls[0][1]
                controller.abort(new Error('user canceled'))
            }
            if (ending === 'lease-lost') {
                f.backend.retainExecution.mock.calls[0][0].onLost(new Error('binding replaced'))
            }
            await jest.advanceTimersByTimeAsync(0)
            expect(signal.aborted).toBe(true)
            expect(f.release).toHaveBeenCalledTimes(1)
            expect(f.cancel.unregister).toHaveBeenCalledWith('execution')
            if (ending === 'lease-lost') {
                expect(signal.reason.message).toBe('binding replaced')
                expect(errors).toContain(signal.reason)
            }
            await jest.advanceTimersByTimeAsync(120_000)
            expect(f.release).toHaveBeenCalledTimes(1)
        }
    )

    it('releases retention if graph compilation fails before an Observable is returned', async () => {
        const f = fixture()
        const execute = f.commandBus.execute.getMockImplementation()!
        f.commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CompileGraphCommand) throw new Error('compile failed')
            return execute(command)
        })
        await expect(f.handler.execute(f.command())).rejects.toThrow('compile failed')
        expect(f.backend.retainExecution).toHaveBeenCalledTimes(1)
        expect(f.release).toHaveBeenCalledTimes(1)
        expect(f.graph.streamEvents).not.toHaveBeenCalled()
    })
})
