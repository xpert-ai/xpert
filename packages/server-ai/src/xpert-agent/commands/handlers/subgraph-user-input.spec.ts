import { createInputGraphFixture, config, input } from './subgraph-input.test-fixture'
import { AIMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import type { RequestUserInputForm, RequestUserInputResult, RequestUserInputToolArgs } from '@xpert-ai/chatkit-types'
import { ClientToolMiddleware } from '../../../xpert-middleware/client-tool.middleware'
import { RequestUserInputMiddleware } from '../../../xpert-middleware/request-user-input.middleware'
import { REQUEST_USER_INPUT_MIDDLEWARE_NAME, REQUEST_USER_INPUT_SCHEMA } from '../../../shared/agent/user-input'

function planInput(text: string) {
    return { ...input(text), human: { input: text, planMode: true } }
}

describe('configured user-input middleware in the compiled Agent graph', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([false, true])(
        'only the configured middleware supplies Plan Mode instructions (enabled=%s)',
        async (enabled) => {
            const clientTools = new ClientToolMiddleware()
            const createClient = jest.spyOn(clientTools, 'createMiddleware')
            const strategy = new RequestUserInputMiddleware(clientTools)
            const create = jest.spyOn(strategy, 'createMiddleware')
            const fixture = createInputGraphFixture({
                middlewareStrategy: strategy,
                middlewareConnected: enabled
            })
            const graph = await fixture.compile()
            await graph.invoke(planInput('hi'), config)
            const system = fixture.requests[0].find((message) => message.getType() === 'system')?.content
            if (enabled) {
                expect(create).toHaveBeenCalledTimes(1)
                expect(createClient.mock.calls[0][0].clientTools[0].schema).toBe(
                    JSON.stringify(REQUEST_USER_INPUT_SCHEMA)
                )
                const context = createClient.mock.calls[0][1]
                expect(context.node.provider).toBe(REQUEST_USER_INPUT_MIDDLEWARE_NAME)
                expect(context).not.toHaveProperty('planMode')
                expect(context).not.toHaveProperty('agentOptions')
                expect(fixture.bindTools.mock.calls[0][0]).toEqual([
                    expect.objectContaining({ name: 'request_user_input' })
                ])
                expect(system).toContain('Implement this plan?')
                expect(system).not.toContain('schemaVersion 1')
            } else {
                expect(create).not.toHaveBeenCalled()
                expect(createClient).not.toHaveBeenCalled()
                expect(fixture.bindTools).not.toHaveBeenCalled()
                expect(system).not.toContain('Plan Mode')
                expect(system).not.toContain('implement_plan')
            }
        }
    )

    it.each(['submitted', 'cancelled'] as const)('resumes Plan Mode questions with a %s result', async (status) => {
        const clientTools = new ClientToolMiddleware()
        const fixture = createInputGraphFixture({
            middlewareStrategy: new RequestUserInputMiddleware(clientTools)
        })
        const args: RequestUserInputToolArgs = {
            questions: [
                {
                    id: 'scope',
                    header: 'Scope',
                    question: 'Which scope?',
                    options: [
                        { label: 'Primary', description: 'Primary Agent only' },
                        { label: 'All', description: 'Every Agent' }
                    ]
                }
            ]
        }
        const call = { id: 'plan-question-1', name: 'request_user_input', args }
        fixture.model.mockImplementation(async (messages) => {
            if (messages.at(-1)?.getType() === 'tool') return new AIMessage('Planning continued')
            return new AIMessage({ content: '', tool_calls: [call] })
        })
        const graph = await fixture.compile({ inputMessageId: 'task-plan-1' })
        await graph.invoke(planInput('Clarify the plan scope'), config)
        expect(
            (await graph.getState(config)).tasks.flatMap((task) => task.interrupts).map((item) => item.value)
        ).toContainEqual({ clientToolCalls: [call] })
        const content: RequestUserInputResult = {
            type: 'request_user_input_result',
            requestId: call.id,
            status,
            purpose: 'plan_clarification',
            answers:
                status === 'submitted'
                    ? [{ id: 'scope', question: 'Which scope?', type: 'option', value: 'Primary' }]
                    : []
        }
        await graph.invoke(new Command({ resume: { toolMessages: [{ tool_call_id: call.id, content }] } }), config)
        const toolResult = fixture.requests[1].find((message) => message.getType() === 'tool')
        expect(typeof toolResult?.content).toBe('string')
        if (typeof toolResult?.content !== 'string') throw new Error('Missing Plan Mode result')
        expect(JSON.parse(toolResult.content)).toMatchObject(content)
        expect(fixture.model).toHaveBeenCalledTimes(2)
        expect((await graph.getState(config)).next).toEqual([])
    })

    it('returns validated form input to the primary Agent and continues the same task', async () => {
        const fixture = createInputGraphFixture({
            middlewareStrategy: new RequestUserInputMiddleware(new ClientToolMiddleware())
        })
        const form: RequestUserInputForm = {
            schemaVersion: 1,
            mode: 'blocking',
            purpose: 'clarification',
            title: 'Scope',
            fields: [{ id: 'scope', type: 'text', label: 'Scope', required: true }]
        }
        const call = { id: 'question-1', name: 'request_user_input', args: form }
        fixture.model.mockImplementation(async (messages) => {
            if (messages.at(-1)?.getType() === 'tool') return new AIMessage('Completed using the answer')
            return new AIMessage({ content: '', tool_calls: [call] })
        })
        const graph = await fixture.compile({ inputMessageId: 'task-1' })
        await graph.invoke(input('Collect scope and continue'), config)
        const saved = await graph.getState(config)
        expect(saved.tasks.flatMap((task) => task.interrupts).map((item) => item.value)).toContainEqual({
            clientToolCalls: [call]
        })
        expect(fixture.model).toHaveBeenCalledTimes(1)
        await graph.invoke(
            new Command({
                resume: {
                    toolMessages: [
                        {
                            tool_call_id: call.id,
                            content: {
                                type: 'request_user_input_result',
                                requestId: call.id,
                                status: 'submitted',
                                values: { scope: 'primary' }
                            }
                        }
                    ]
                }
            }),
            config
        )
        const toolResult = fixture.requests[1].find((message) => message.getType() === 'tool')
        expect(typeof toolResult?.content).toBe('string')
        if (typeof toolResult?.content !== 'string') throw new Error('Missing form result')
        expect(JSON.parse(toolResult.content)).toMatchObject({ purpose: 'clarification', values: { scope: 'primary' } })
        expect(fixture.model).toHaveBeenCalledTimes(2)
        expect((await graph.getState(config)).next).toEqual([])
    })
})
