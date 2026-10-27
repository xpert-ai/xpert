import { createInvokeHarness, createGraph, createCompiledGraph, consumeStream } from './invoke.test-fixture'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { Command } from '@langchain/langgraph'
describe('Invocation input and pause boundary', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it.each(['persisted-message', undefined])(
        'assigns trusted input identity on a new send (%s)',
        async (inputMessageId) => {
            const { handler, commandBus } = createInvokeHarness()
            const graph = createGraph()
            commandBus.execute.mockImplementation(async (command) =>
                command instanceof CompileGraphCommand ? createCompiledGraph(graph) : null
            )
            const stream = await handler.execute(
                new XpertAgentInvokeCommand(
                    { human: { input: 'hi' }, inputIdentity: { id: 'untrusted' } } as never,
                    'agent-1',
                    { id: 'xpert-1', features: {} } as never,
                    {
                        execution: { id: 'execution-1' },
                        thread_id: 'thread-1',
                        subscriber: { next: jest.fn() },
                        store: null,
                        inputMessageId
                    } as never
                )
            )
            await consumeStream(stream)
            expect(graph.streamEvents.mock.calls[0][0]).toMatchObject({
                human: { input: 'hi' },
                inputIdentity: { id: inputMessageId ?? 'execution-1' }
            })
        }
    )

    it.each(['resume', 'retry', 'pause-resume'])('does not admit fresh human input on %s', async (mode) => {
        const { handler, commandBus } = createInvokeHarness()
        const graph = createGraph()
        commandBus.execute.mockImplementation(async (command) =>
            command instanceof CompileGraphCommand ? createCompiledGraph(graph) : null
        )
        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                { human: { input: 'must not be sent' }, inputIdentity: { id: 'untrusted' } } as never,
                'agent-1',
                { id: 'xpert-1', features: {} } as never,
                {
                    execution: { id: 'execution-1' },
                    thread_id: 'thread-1',
                    subscriber: { next: jest.fn() },
                    store: null,
                    ...(mode === 'resume' ? { resume: { decision: { type: 'confirm', payload: 'approved' } } } : {}),
                    ...(mode === 'retry' ? { checkpointId: 'input-checkpoint' } : {}),
                    ...(mode === 'pause-resume'
                        ? { resumeCheckpoint: { threadId: 'thread-1', checkpointNs: '', checkpointId: 'saved' } }
                        : {})
                } as never
            )
        )
        await consumeStream(stream)
        const submitted = graph.streamEvents.mock.calls[0][0]
        if (mode === 'pause-resume') expect(submitted).toBeNull()
        else {
            expect(submitted).toBeInstanceOf(Command)
            expect(submitted.update).not.toHaveProperty('human')
            expect(submitted.update).not.toHaveProperty('inputIdentity')
            if (mode === 'resume') expect(submitted.resume).toBe('approved')
        }
    })
    it.each([false, true])('retains an input checkpoint even with no next nodes (pause=%s)', async (paused) => {
        const { commandBus, queryBus, createHandler } = createInvokeHarness()
        const control = {
            ensureExecution: jest.fn(),
            requiresInputAdmission: jest.fn().mockResolvedValue(false),
            recordGraph: jest.fn(),
            shouldPause: jest.fn().mockResolvedValue(paused),
            stageInput: jest.fn(),
            stageCheckpoint: jest.fn()
        }
        const handler = createHandler(control as never)
        const graph = createGraph()
        const pending = {
            id: 'shell-task',
            name: 'desktop_shell',
            interrupts: [{ value: { actionRequests: [{ name: 'desktop_shell' }] } }]
        }
        graph.getState.mockResolvedValue({
            config: { configurable: { thread_id: 'thread-1', checkpoint_ns: '', checkpoint_id: 'saved' } },
            values: {},
            next: [],
            tasks: [{ id: 'finished', name: 'other', result: { output: 'done' }, interrupts: [] }, pending]
        })
        commandBus.execute.mockImplementation(async (command) =>
            command instanceof CompileGraphCommand ? createCompiledGraph(graph) : null
        )
        queryBus.execute.mockResolvedValue({ tasks: [pending] })
        const subscriber = { next: jest.fn() }
        const stream = await handler.execute(
            new XpertAgentInvokeCommand(
                { human: { input: 'Run the tool' } } as never,
                'agent-1',
                { id: 'xpert-1', features: {} } as never,
                {
                    thread_id: 'thread-1',
                    execution: { id: 'execution-1', threadId: 'thread-1' },
                    subscriber,
                    store: null
                } as never
            )
        )
        await consumeStream(stream).catch(() => undefined)
        expect(control.stageInput).toHaveBeenCalledWith('thread-1', 'execution-1', ['desktop_shell'])
        expect(control.stageCheckpoint).not.toHaveBeenCalled()
        expect(subscriber.next).toHaveBeenCalledWith({
            data: {
                type: 'event',
                event: ChatMessageEventTypeEnum.ON_INTERRUPT,
                data: { tasks: [pending] }
            }
        })
    })
})
