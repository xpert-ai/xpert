import type { ToolCall } from '@langchain/core/messages/tool'
import type { ClientToolMessageInput, RequestUserInputForm } from '@xpert-ai/chatkit-types'
import { AgentMiddlewareRegistry, type AgentMiddleware, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { resolveUserInputMessage } from './user-input'
import { createRuntimeUserInputMiddlewareEntries } from './runtime-user-input'
import { Annotation, Command, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { ToolMessage } from '@langchain/core/messages'
import { ClientToolMiddleware } from '../../xpert-middleware/client-tool.middleware'

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
    it('injects a form tool in ordinary mode and preserves the Plan Mode schema', async () => {
        const createMiddleware = jest.fn().mockResolvedValue({ name: 'ClientToolMiddleware' } satisfies AgentMiddleware)
        const registry = {
            get: jest.fn().mockReturnValue({ createMiddleware, meta: { name: 'ClientToolMiddleware' } })
        } as unknown as AgentMiddlewareRegistry
        const context = { tenantId: 'tenant-1', userId: 'user-1', tools: new Map(), runtime: {} } as Omit<
            IAgentMiddlewareContext,
            'node'
        >
        const entries = await createRuntimeUserInputMiddlewareEntries(registry, context, false)
        expect(entries.map((entry) => entry.key)).toContain('__xpert_user_input__')
        const schema = JSON.parse(createMiddleware.mock.calls[0][0].clientTools[0].schema)
        expect(schema.properties.mode.enum).toEqual(['blocking'])
        expect(schema.properties.fields.items.properties.type.enum).toHaveLength(8)
        await createRuntimeUserInputMiddlewareEntries(registry, context, true)
        expect(JSON.parse(createMiddleware.mock.calls[1][0].clientTools[0].schema).properties.questions).toBeDefined()
    })
    it.each(['submitted', 'cancelled'] as const)(
        'persists a real graph interrupt and resumes a %s response',
        async (status) => {
            const strategy = new ClientToolMiddleware()
            const registry = { get: () => strategy } as unknown as AgentMiddlewareRegistry
            const context = { tenantId: 'tenant-1', userId: 'user-1', tools: new Map(), runtime: {} } as Omit<
                IAgentMiddlewareContext,
                'node'
            >
            const [{ middleware }] = await createRuntimeUserInputMiddlewareEntries(registry, context, false)
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
