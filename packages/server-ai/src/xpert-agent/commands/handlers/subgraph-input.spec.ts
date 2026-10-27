import {
    createInputGraphFixture,
    agentChannel,
    agentKey,
    config,
    humanMessages,
    input,
    toolName
} from './subgraph-input.test-fixture'
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { Command, interrupt } from '@langchain/langgraph'
import { getChannelState } from '../../agent'

describe('checkpointed agent input consumption', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([false, true])(
        'sends a new repeated greeting after a paused tool result (beforeModel=%s)',
        async (beforeModel) => {
            const fixture = createInputGraphFixture({ beforeModel })
            let pause = false
            fixture.toolRun.mockImplementation(async () => {
                pause = true
                return 'done'
            })
            let graph = await fixture.compile({ inputMessageId: 'old-hi', shouldPause: async () => pause })
            await graph.invoke(input('hi'), config)
            graph = await fixture.compile({ inputMessageId: 'old-task', shouldPause: async () => pause })
            await graph.invoke(input('old task'), config)
            const saved = await graph.getState(config)
            expect(saved.values[agentChannel].messages.at(-1)).toBeInstanceOf(ToolMessage)
            expect(saved.tasks.some((task) => task.interrupts.length)).toBe(true)
            expect(fixture.toolRun).toHaveBeenCalledTimes(1)

            // A new send has a new identity, even when its text occurred earlier.
            graph = await fixture.compile({ inputMessageId: 'new-hi' })
            const result = await graph.invoke(input('hi'), config)
            const request = fixture.requests.at(-1)
            expect(humanMessages(request).map((message) => message.content)).toEqual(['hi', 'old task', 'hi'])
            expect(humanMessages(request).at(-1).id).toBe(`input:new-hi:${agentKey}:0`)
            expect(getChannelState(result, agentChannel).inputReceipt).toEqual({ id: 'new-hi', status: 'consumed' })
            for (const messages of [result.messages, getChannelState(result, agentChannel).messages])
                expect(
                    messages.filter((message: BaseMessage) => message.id === `input:new-hi:${agentKey}:0`)
                ).toHaveLength(1)
            expect(fixture.toolRun).toHaveBeenCalledTimes(1)
            expect(getChannelState(result, agentChannel).messages.at(-1).content).toBe('hello')
            if (beforeModel) expect(fixture.beforeModel).toHaveBeenCalled()
        }
    )

    it('does not inject again during a normal tool loop', async () => {
        const fixture = createInputGraphFixture({ beforeModel: true })
        const graph = await fixture.compile({ inputMessageId: 'task' })
        const result = await graph.invoke(input('old task'), config)
        expect(fixture.requests).toHaveLength(2)
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
        for (const request of fixture.requests) expect(humanMessages(request)).toHaveLength(1)
        expect(humanMessages(result.messages)).toHaveLength(1)
        expect(getChannelState(result, agentChannel).inputReceipt.status).toBe('consumed')
    })

    it('consumes a pending input after Pause before the first model, including a recompiled Resume', async () => {
        const fixture = createInputGraphFixture({ beforeModel: true })
        let graph = await fixture.compile({ inputMessageId: 'pending', shouldPause: async (node) => node === agentKey })
        await graph.invoke(input('hi'), config)
        expect(fixture.requests).toHaveLength(0)
        const checkpoint = await graph.getState(config)
        expect(checkpoint.values[agentChannel].inputReceipt).toEqual({ id: 'pending', status: 'pending' })
        graph = await fixture.compile({
            resumeCheckpoint: {
                threadId: config.configurable.thread_id,
                checkpointNs: '',
                checkpointId: checkpoint.config.configurable.checkpoint_id
            }
        })
        const result = await graph.invoke(null, config)
        expect(humanMessages(fixture.requests[0])).toHaveLength(1)
        expect(getChannelState(result, agentChannel).inputReceipt).toEqual({ id: 'pending', status: 'consumed' })
    })

    it('resumes after a completed tool without injecting input or executing the tool again', async () => {
        const fixture = createInputGraphFixture()
        let pause = false
        fixture.toolRun.mockImplementation(async () => {
            pause = true
            return 'done'
        })
        let graph = await fixture.compile({ inputMessageId: 'task', shouldPause: async () => pause })
        await graph.invoke(input('old task'), config)
        const saved = await graph.getState(config)
        graph = await fixture.compile({
            resumeCheckpoint: {
                threadId: config.configurable.thread_id,
                checkpointNs: '',
                checkpointId: saved.config.configurable.checkpoint_id
            }
        })
        const result = await graph.invoke(null, config)
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
        expect(humanMessages(result.messages)).toHaveLength(1)
        expect(fixture.requests.at(-1).at(-1)).toBeInstanceOf(ToolMessage)
    })

    it('retries from the saved input boundary and ignores a replacement payload', async () => {
        const fixture = createInputGraphFixture()
        let graph = await fixture.compile({ inputMessageId: 'task' })
        // This is the same input-admission boundary used by invoke.handler.
        await graph.invoke({ ...input('hi'), inputIdentity: { id: 'task' } }, { ...config, interruptBefore: '*' })
        const boundary = await graph.getState(config)
        await graph.invoke(null, config)
        graph = await fixture.compile({ checkpointId: boundary.config.configurable.checkpoint_id })
        const result = await graph.invoke(new Command({ update: { sys: input('ignored').sys } }), boundary.config)
        expect(fixture.requests).toHaveLength(2)
        expect(humanMessages(fixture.requests[0])[0].id).toBe(humanMessages(fixture.requests[1])[0].id)
        for (const request of fixture.requests)
            expect(humanMessages(request).map((message) => message.content)).toEqual(['hi'])
        expect(humanMessages(result.messages)).toHaveLength(1)
        expect(fixture.toolRun).not.toHaveBeenCalled()
    })

    it('keeps the same identity when replaying an input checkpoint after staging', async () => {
        const fixture = createInputGraphFixture()
        let graph = await fixture.compile({ inputMessageId: 'task' })
        await graph.invoke(input('hi'), { ...config, interruptBefore: [agentKey] })
        const boundary = await graph.getState(config)
        await graph.invoke(null, config)
        graph = await fixture.compile({ checkpointId: boundary.config.configurable.checkpoint_id })
        const result = await graph.invoke(new Command({ update: { sys: input('ignored').sys } }), boundary.config)
        expect(humanMessages(result.messages)).toHaveLength(1)
        expect(humanMessages(fixture.requests[0])[0].id).toBe(humanMessages(fixture.requests[1])[0].id)
    })

    it('accepts a new send when a legacy checkpoint ends in a different HumanMessage', async () => {
        const fixture = createInputGraphFixture()
        const graph = await fixture.compile({ inputMessageId: 'new' })
        const old = new HumanMessage({ id: 'old', content: 'unanswered old input' })
        await graph.invoke({ ...input('hi'), messages: [old], [agentChannel]: { messages: [old] } }, config)
        expect(humanMessages(fixture.requests[0]).map((message) => message.content)).toEqual([
            'unanswered old input',
            'hi'
        ])
        expect(fixture.toolRun).not.toHaveBeenCalled()
    })

    it('does not deduplicate distinct sends by text, but consumes an identical input identity once', async () => {
        const fixture = createInputGraphFixture()
        for (const id of ['one', 'one', 'two']) {
            const graph = await fixture.compile({ inputMessageId: id })
            await graph.invoke(input('hi'), config)
        }
        expect(humanMessages(fixture.requests.at(-1))).toHaveLength(2)
        expect(humanMessages(fixture.requests.at(-1)).map((message) => message.id)).toEqual([
            `input:one:${agentKey}:0`,
            `input:two:${agentKey}:0`
        ])
    })

    it('closes only missing tool results when a new send follows cancellation before a result', async () => {
        const fixture = createInputGraphFixture()
        const graph = await fixture.compile({ inputMessageId: 'new' })
        const history = [
            new HumanMessage({ id: 'old', content: 'old task' }),
            new AIMessage({
                id: 'calls',
                content: '',
                tool_calls: [
                    { id: 'completed', name: toolName, args: {} },
                    { id: 'unrecorded', name: toolName, args: {} }
                ]
            }),
            new ToolMessage({
                id: 'completed-result',
                content: 'real result',
                name: toolName,
                tool_call_id: 'completed'
            })
        ]
        const result = await graph.invoke(
            { ...input('hi'), messages: history, [agentChannel]: { messages: history } },
            config
        )
        const tools = fixture.requests[0].filter((message) => message.getType() === 'tool') as ToolMessage[]
        expect(tools.map((message) => message.tool_call_id)).toEqual(['completed', 'unrecorded'])
        expect(tools[0].content).toBe('real result')
        expect(tools[1].status).toBe('error')
        expect(humanMessages(result.messages).at(-1).content).toBe('hi')
        expect(fixture.toolRun).not.toHaveBeenCalled()
    })

    it('retains the pending identity if model execution fails before committing messages', async () => {
        const fixture = createInputGraphFixture()
        fixture.model.mockRejectedValueOnce(new Error('provider unavailable'))
        let graph = await fixture.compile({ inputMessageId: 'pending' })
        await expect(graph.invoke(input('hi'), config)).rejects.toThrow('provider unavailable')
        expect((await graph.getState(config)).values[agentChannel].inputReceipt.status).toBe('pending')
        graph = await fixture.compile()
        const result = await graph.invoke(null, config)
        expect(humanMessages(result.messages)).toHaveLength(1)
        expect(humanMessages(fixture.requests[0])[0].id).toBe(humanMessages(fixture.requests[1])[0].id)
    })

    it('does not re-inject input on a middleware model-only loop', async () => {
        let calls = 0
        const fixture = createInputGraphFixture({
            middleware: {
                name: 'model-loop',
                afterModel: async () => (++calls === 1 ? { jumpTo: 'model' } : undefined)
            }
        })
        const graph = await fixture.compile({ inputMessageId: 'greeting' })
        const result = await graph.invoke(input('hi'), config)
        expect(fixture.requests).toHaveLength(2)
        expect(humanMessages(result.messages)).toHaveLength(1)
        for (const request of fixture.requests) expect(humanMessages(request)).toHaveLength(1)
    })

    it('resumes a HITL tool with Command.resume without creating a new send', async () => {
        const fixture = createInputGraphFixture()
        const sideEffect = jest.fn()
        fixture.toolRun.mockImplementation(async () => {
            const answer = interrupt('Approve test operation')
            sideEffect(answer)
            return 'done'
        })
        let graph = await fixture.compile({ inputMessageId: 'task' })
        await graph.invoke(input('old task'), config)
        expect(sideEffect).not.toHaveBeenCalled()
        graph = await fixture.compile()
        const result = await graph.invoke(new Command({ resume: 'approved' }), config)
        expect(sideEffect).toHaveBeenCalledTimes(1)
        expect(sideEffect).toHaveBeenCalledWith('approved')
        expect(humanMessages(result.messages)).toHaveLength(1)
        expect(fixture.requests.at(-1).at(-1)).toBeInstanceOf(ToolMessage)
    })

    it('handles a real cancellation while a tool is waiting for its result', async () => {
        const fixture = createInputGraphFixture()
        const controller = new AbortController()
        let started: () => void
        const toolStarted = new Promise<void>((resolve) => {
            started = resolve
        })
        fixture.toolRun.mockImplementationOnce(async () => {
            started()
            await new Promise<void>((_resolve, reject) => {
                controller.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
            })
            return 'unreachable'
        })
        let graph = await fixture.compile({
            inputMessageId: 'old',
            rootController: controller,
            signal: controller.signal
        })
        const running = graph.invoke(input('old task'), { ...config, signal: controller.signal })
        const rejected = expect(running).rejects.toThrow()
        await toolStarted
        controller.abort()
        await rejected
        expect((await graph.getState(config)).values[agentChannel].messages.at(-1)).toBeInstanceOf(AIMessage)
        graph = await fixture.compile({ inputMessageId: 'new' })
        const result = await graph.invoke(input('hi'), config)
        expect(humanMessages(fixture.requests.at(-1)).map((message) => message.content)).toEqual(['old task', 'hi'])
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
        expect(getChannelState(result, agentChannel).messages.at(-1).content).toBe('hello')
    })

    it('defers a pending steer until the new send has entered model history', async () => {
        const fixture = createInputGraphFixture()
        fixture.repository.find.mockResolvedValue([
            {
                id: 'steer',
                content: 'hi',
                attachments: [],
                thirdPartyMessage: { followUpInput: { input: 'hi' }, followUpClientMessageId: 'steer-client' }
            }
        ])
        const graph = await fixture.compile({ inputMessageId: 'new-task' })
        const result = await graph.invoke(input('old task'), config)
        expect(humanMessages(fixture.requests[0]).map((message) => message.content)).toEqual(['old task'])
        expect(humanMessages(fixture.requests[1]).map((message) => message.content)).toEqual(['old task', 'hi'])
        expect(humanMessages(result.messages)).toHaveLength(2)
        expect(fixture.repository.save).toHaveBeenCalledTimes(1)
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
    })

    it('keeps internal agent invocations independent of the parent input identity', async () => {
        const fixture = createInputGraphFixture()
        const graph = await fixture.compile({ leaderKey: 'parent' })
        for (let index = 0; index < 2; index++) {
            await graph.invoke({ ...input('hi'), inputIdentity: { id: 'parent-input' } }, config)
        }
        const messages = humanMessages(fixture.requests.at(-1))
        expect(messages).toHaveLength(2)
        expect(messages[0].id).not.toBe(messages[1].id)
        expect(messages.every((message) => !message.id.includes('parent-input'))).toBe(true)
    })

    it('injects each configured prompt template once across tool iterations', async () => {
        const fixture = createInputGraphFixture({
            promptTemplates: [
                { id: 'first', role: 'human', text: 'Request: {{human.input}}' },
                { id: 'second', role: 'human', text: 'Use the tools when needed.' }
            ]
        })
        const graph = await fixture.compile({ inputMessageId: 'templates' })
        const result = await graph.invoke(input('task'), config)
        expect(fixture.requests).toHaveLength(2)
        for (const request of fixture.requests) {
            expect(humanMessages(request).map((message) => message.id)).toEqual([
                `input:templates:${agentKey}:0`,
                `input:templates:${agentKey}:1`
            ])
        }
        expect(humanMessages(result.messages)).toHaveLength(2)
    })

    it('keeps disabled-history tool loops valid after a new input', async () => {
        const fixture = createInputGraphFixture({ disableMessageHistory: true })
        let pause = false
        fixture.toolRun.mockImplementation(async () => {
            pause = true
            return 'done'
        })
        let graph = await fixture.compile({ inputMessageId: 'old', shouldPause: async () => pause })
        await graph.invoke(input('old task'), config)
        graph = await fixture.compile({ inputMessageId: 'new' })
        const result = await graph.invoke(input('hi'), config)
        expect(humanMessages(fixture.requests.at(-1)).map((message) => message.content)).toEqual(['hi'])
        expect(getChannelState(result, agentChannel).messages.map((message) => message.getType())).toEqual([
            'human',
            'ai'
        ])
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
    })

    it('accepts a new send after cancellation at the tool-result/model boundary', async () => {
        const controller = new AbortController()
        let modelBoundaries = 0
        const fixture = createInputGraphFixture({
            middleware: {
                name: 'cancel-boundary',
                beforeModel: async () => {
                    if (++modelBoundaries === 2) {
                        controller.abort()
                        controller.signal.throwIfAborted()
                    }
                }
            }
        })
        let graph = await fixture.compile({
            inputMessageId: 'old',
            rootController: controller,
            signal: controller.signal
        })
        await expect(graph.invoke(input('old task'), { ...config, signal: controller.signal })).rejects.toThrow()
        expect((await graph.getState(config)).values[agentChannel].messages.at(-1)).toBeInstanceOf(ToolMessage)
        graph = await fixture.compile({ inputMessageId: 'new' })
        await graph.invoke(input('hi'), config)
        expect(humanMessages(fixture.requests.at(-1)).map((message) => message.content)).toEqual(['old task', 'hi'])
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
    })

    it('does not rerun completed tools when replaying a saved model boundary', async () => {
        const fixture = createInputGraphFixture()
        let pause = false
        fixture.toolRun.mockImplementation(async () => {
            pause = true
            return 'done'
        })
        let graph = await fixture.compile({ inputMessageId: 'task', shouldPause: async () => pause })
        await graph.invoke(input('old task'), config)
        const boundary = await graph.getState(config)
        graph = await fixture.compile({ checkpointId: boundary.config.configurable.checkpoint_id })
        const result = await graph.invoke(new Command({ update: { sys: input('ignored').sys } }), boundary.config)
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
        expect(humanMessages(result.messages)).toHaveLength(1)
        expect(fixture.requests.at(-1).at(-1)).toBeInstanceOf(ToolMessage)
    })

    it('resumes legacy history without fabricating an untracked user input', async () => {
        const fixture = createInputGraphFixture()
        let graph = await fixture.compile({ inputMessageId: 'old' })
        await graph.invoke(input('hi'), { ...config, interruptBefore: [agentKey] })
        const history = [
            new HumanMessage({ id: 'legacy-human', content: 'old task' }),
            new AIMessage({
                id: 'legacy-ai',
                content: '',
                tool_calls: [{ id: 'legacy-call', name: toolName, args: {} }]
            }),
            new ToolMessage({ content: 'done', tool_call_id: 'legacy-call', name: toolName })
        ]
        await graph.updateState(config, {
            messages: history,
            [agentChannel]: { messages: history, inputReceipt: undefined }
        })
        graph = await fixture.compile()
        const result = await graph.invoke(null, config)
        expect(humanMessages(result.messages).map((message) => message.content)).toEqual(['old task'])
        expect(fixture.requests[0].at(-1)).toBeInstanceOf(ToolMessage)
        expect(fixture.toolRun).not.toHaveBeenCalled()
    })

    it.each([false, true])('bootstraps a verified legacy Retry input boundary once (steer=%s)', async (steer) => {
        const fixture = createInputGraphFixture()
        let graph = await fixture.compile()
        await graph.invoke(input('old task'), { ...config, interruptBefore: [`${agentKey}_stage_pending_follow_ups`] })
        // Old checkpoints have human.input but no receipt and schedule an existing
        // model/pre-turn node, bypassing the newly introduced input-staging node.
        await graph.updateState(config, { [agentChannel]: { inputReceipt: undefined } })
        if (steer)
            fixture.repository.find.mockResolvedValue([
                {
                    id: 'steer',
                    content: 'hi',
                    attachments: [],
                    thirdPartyMessage: { followUpInput: { input: 'hi' } }
                }
            ])
        const legacy = await graph.getState(config)
        const checkpointId = legacy.config.configurable.checkpoint_id
        graph = await fixture.compile({ checkpointId })
        const result = await graph.invoke(new Command({ update: { sys: input('ignored').sys } }), {
            ...legacy.config,
            configurable: {
                ...config.configurable,
                ...legacy.config.configurable,
                xpertRetryInputCheckpointId: checkpointId
            }
        })
        expect(fixture.requests).toHaveLength(2)
        for (const request of fixture.requests) {
            expect(humanMessages(request).filter((message) => message.content === 'old task')).toHaveLength(1)
        }
        expect(humanMessages(result.messages).map((message) => message.content)).toEqual(
            steer ? ['old task', 'hi'] : ['old task']
        )
        expect(getChannelState(result, agentChannel).inputReceipt).toEqual({
            id: `retry:${checkpointId}`,
            status: 'consumed'
        })
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
    })
})
