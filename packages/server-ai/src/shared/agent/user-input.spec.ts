import type { ToolCall } from '@langchain/core/messages/tool'
import type { ClientToolMessageInput, RequestUserInputForm } from '@xpert-ai/chatkit-types'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { resolveUserInputMessage } from './user-input'
import { Annotation, Command, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { ModelRequest } from '@xpert-ai/plugin-sdk'
import { FakeStreamingChatModel } from './fake-streaming-chat-model'
import { ClientToolMiddleware } from '../../xpert-middleware/client-tool.middleware'
import { RequestUserInputMiddleware } from '../../xpert-middleware/request-user-input.middleware'

function formContext(): IAgentMiddlewareContext {
    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        tools: new Map(),
        runtime: { createModelClient: jest.fn(), wrapWorkflowNodeExecution: jest.fn() },
        node: {
            id: 'input',
            key: 'input',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: 'RequestUserInputMiddleware'
        }
    }
}

const form: RequestUserInputForm = {
    schemaVersion: 1,
    mode: 'blocking',
    purpose: 'clarification',
    title: 'Sales scope',
    fields: [
        { id: 'implement_plan', type: 'boolean', label: 'Include refunds?', required: true },
        { id: 'minimum', type: 'number', label: 'Minimum', min: 0, required: true }
    ]
}
const call: ToolCall = { id: 'call-1', name: 'request_user_input', args: form }
const execute = jest.fn()
function response(overrides: object = {}): ClientToolMessageInput {
    return {
        content: {
            type: 'request_user_input_result',
            requestId: 'call-1',
            status: 'submitted',
            values: { implement_plan: false, minimum: 0 },
            ...overrides
        }
    }
}

describe('runtime user input', () => {
    const plan = {
        questions: [
            {
                id: 'scope',
                header: 'Scope',
                question: 'Scope?',
                options: [
                    { label: 'Primary', description: 'Primary only' },
                    { label: 'All', description: 'All Agents' }
                ]
            }
        ]
    }

    it.each([
        { planMode: false, args: plan },
        { planMode: true, args: form },
        { planMode: true, args: { ...plan, ...form } },
        { planMode: false, args: { ...plan, ...form } },
        { planMode: true, args: { questions: [{ ...plan.questions[0], options: [] }] } }
    ])('rejects arguments outside the current runtime protocol before interrupting: %j', async ({ planMode, args }) => {
        const middleware = await new RequestUserInputMiddleware(new ClientToolMiddleware()).createMiddleware(
            {},
            formContext()
        )
        const handler = jest.fn()
        await expect(
            middleware.wrapToolCall!(
                {
                    toolCall: { ...call, args },
                    tool: middleware.tools![0],
                    state: { messages: [], human: { planMode } },
                    runtime: {}
                },
                handler
            )
        ).rejects.toThrow()
        expect(handler).not.toHaveBeenCalled()
    })

    it('selects prompts from runtime state without re-registering or replacing the tool', async () => {
        const clientTools = new ClientToolMiddleware()
        const create = jest.spyOn(clientTools, 'createMiddleware')
        const middleware = await new RequestUserInputMiddleware(clientTools).createMiddleware({}, formContext())
        const registeredTool = middleware.tools![0]
        const request: ModelRequest = {
            model: new FakeStreamingChatModel({}),
            messages: [],
            tools: middleware.tools!,
            systemMessage: new SystemMessage('base'),
            state: { messages: [], human: { planMode: false } },
            runtime: {}
        }
        const handler = jest.fn(async (_request: ModelRequest) => new AIMessage('done'))
        await middleware.wrapModelCall!(request, handler)
        await middleware.wrapModelCall!({ ...request, state: { messages: [], human: { planMode: true } } }, handler)
        await middleware.wrapModelCall!(request, handler)
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('schemaVersion 1')
        expect(handler.mock.calls[1][0].systemMessage.content).toContain('Implement this plan?')
        expect(handler.mock.calls[1][0].systemMessage.content).not.toContain('schemaVersion 1')
        expect(handler.mock.calls[2][0].systemMessage.content).toContain('schemaVersion 1')
        expect(handler.mock.calls[2][0].systemMessage.content).not.toContain('Implement this plan?')
        expect(handler.mock.calls.every(([request]) => request.tools[0] === registeredTool)).toBe(true)
        expect(create).toHaveBeenCalledTimes(1)
    })

    it('validates typed answers and derives clarification purpose from the server request', () => {
        expect(
            resolveUserInputMessage(response({ purpose: 'implementation_confirmation' }), call, execute)
        ).toMatchObject({
            tool_call_id: 'call-1',
            content: { purpose: 'clarification', values: { implement_plan: false, minimum: 0 }, form }
        })
    })
    it.each([
        { values: { minimum: 0 } },
        { values: { implement_plan: 'false', minimum: 0 } },
        { requestId: 'different-call' },
        { status: 'approved' },
        { values: { implement_plan: false, minimum: -1 } },
        { values: { implement_plan: false, minimum: 0, secret: 'unknown' } }
    ])('rejects forged or invalid responses %j', (override) => {
        expect(() => resolveUserInputMessage(response(override), call, execute)).toThrow()
    })
    it('returns explicit cancellation without any supplied answers', () => {
        const result = resolveUserInputMessage(response({ status: 'cancelled' }), call, execute)
        expect(result).toMatchObject({ content: { status: 'cancelled', purpose: 'clarification', answers: [] } })
        expect(result).not.toHaveProperty('content.values')
    })
    it.each(['submitted', 'cancelled'] as const)(
        'persists a real graph interrupt and resumes a %s response',
        async (status) => {
            const strategy = new RequestUserInputMiddleware(new ClientToolMiddleware())
            const middleware = await strategy.createMiddleware({}, formContext())
            const State = Annotation.Root({ result: Annotation<string> })
            const graph = new StateGraph(State)
                .addNode('ask', async () => {
                    const result = await middleware.wrapToolCall!(
                        { toolCall: call, tool: middleware.tools![0], state: { messages: [] }, runtime: {} },
                        async () => {
                            throw new Error('A client tool must interrupt rather than execute on the server')
                        }
                    )
                    if (!(result instanceof ToolMessage) || typeof result.content !== 'string')
                        throw new Error('Expected a tool message')
                    return { result: result.content }
                })
                .addEdge(START, 'ask')
                .addEdge('ask', END)
                .compile({ checkpointer: new MemorySaver() })
            const config = { configurable: { thread_id: `form-${status}` } }
            await graph.invoke({}, config)
            const snapshot = await graph.getState(config)
            expect(snapshot.tasks[0].interrupts[0].value).toEqual({ clientToolCalls: [call] })
            expect(snapshot.values.result).toBeUndefined()
            const completed = await graph.invoke(
                new Command({ resume: { toolMessages: [{ ...response({ status }), tool_call_id: call.id }] } }),
                config
            )
            expect(JSON.parse(completed.result)).toMatchObject({ requestId: call.id, status, purpose: 'clarification' })
            expect((await graph.getState(config)).next).toEqual([])
        }
    )
})
