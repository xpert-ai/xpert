const mockInterrupt = jest.fn()
const mockDispatchCustomEvent = jest.fn()

jest.mock('@langchain/langgraph', () => {
    const actual = jest.requireActual('@langchain/langgraph')
    return {
        ...actual,
        interrupt: (...args: unknown[]) => mockInterrupt(...args)
    }
})

jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: (...args: unknown[]) => mockDispatchCustomEvent(...args)
}))

jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')
    return {
        ...actual,
        AgentMiddlewareStrategy: () => (target: unknown) => target
    }
})

import { ToolMessage } from '@langchain/core/messages'
import type { ToolCall } from '@langchain/core/messages/tool'
import { GraphInterrupt } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, IWFNMiddleware, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import {
    AgentMiddleware,
    AgentMiddlewareRuntimeApi,
    IAgentMiddlewareContext,
    ToolCallHandler,
    ToolCallRequest
} from '@xpert-ai/plugin-sdk'
import { ClientToolMiddleware } from './client-tool.middleware'

const CLIENT_TOOL_SCHEMA = JSON.stringify({
    type: 'object',
    additionalProperties: false,
    properties: {
        text: {
            type: 'string'
        }
    },
    required: ['text']
})

function createRuntime(): AgentMiddlewareRuntimeApi {
    return {
        async createModelClient() {
            throw new Error('createModelClient is not used in these tests.')
        },
        async wrapWorkflowNodeExecution(run, params) {
            void params
            return (await run({})).state
        }
    }
}

function createContext(): IAgentMiddlewareContext {
    const node: IWFNMiddleware = {
        id: 'middleware-1',
        key: 'middleware-1',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: 'ClientToolMiddleware'
    }

    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        node,
        tools: new Map(),
        runtime: createRuntime()
    }
}

async function createClientToolAgentMiddleware(options: { emitToolMessages?: boolean } = {}) {
    const strategy = new ClientToolMiddleware()
    return Promise.resolve(
        strategy.createMiddleware(
            {
                ...(options.emitToolMessages ? { emitToolMessages: true } : {}),
                clientTools: [
                    {
                        name: 'client_tool',
                        description: 'Runs in the client',
                        schema: CLIENT_TOOL_SCHEMA
                    }
                ]
            },
            createContext()
        )
    )
}

function getFirstTool(middleware: AgentMiddleware) {
    const firstTool = middleware.tools?.[0]
    if (!firstTool) {
        throw new Error('Expected middleware to expose a tool.')
    }
    return firstTool
}

function getWrapToolCall(middleware: AgentMiddleware): NonNullable<AgentMiddleware['wrapToolCall']> {
    if (!middleware.wrapToolCall) {
        throw new Error('Expected middleware to expose wrapToolCall.')
    }
    return middleware.wrapToolCall
}

function createToolCallRequest(middleware: AgentMiddleware, toolCall: ToolCall): ToolCallRequest {
    return {
        toolCall,
        tool: getFirstTool(middleware),
        state: {
            messages: []
        },
        runtime: {}
    }
}

describe('ClientToolMiddleware', () => {
    beforeEach(() => {
        mockInterrupt.mockReset()
        mockDispatchCustomEvent.mockReset()
        mockDispatchCustomEvent.mockResolvedValue(undefined)
    })

    it('creates declared client tools', async () => {
        const middleware = await createClientToolAgentMiddleware()

        expect(middleware.name).toBe('ClientToolMiddleware')
        expect(middleware.tools?.map((toolItem) => toolItem.name)).toEqual(['client_tool'])
    })

    it('passes non-client tool calls to the original handler', async () => {
        const middleware = await createClientToolAgentMiddleware()
        const request = createToolCallRequest(middleware, {
            type: 'tool_call',
            id: 'server-call-1',
            name: 'server_tool',
            args: {}
        })
        let handlerCalled = false
        const handler: ToolCallHandler = async (handlerRequest) => {
            handlerCalled = handlerRequest === request
            return new ToolMessage({
                content: 'server result',
                name: 'server_tool',
                tool_call_id: 'server-call-1'
            })
        }

        const result = await getWrapToolCall(middleware)(request, handler)

        expect(handlerCalled).toBe(true)
        expect(result).toBeInstanceOf(ToolMessage)
        expect(mockInterrupt).not.toHaveBeenCalled()
        expect(mockDispatchCustomEvent).not.toHaveBeenCalled()
    })

    it('interrupts client tool calls and resumes with a ToolMessage', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'client-call-1',
                    name: 'client_tool',
                    content: {
                        ok: true
                    },
                    status: 'success'
                }
            ]
        })

        const middleware = await createClientToolAgentMiddleware({
            emitToolMessages: true
        })
        const toolCall: ToolCall = {
            type: 'tool_call',
            id: 'client-call-1',
            name: 'client_tool',
            args: {
                text: 'hello'
            }
        }
        const request = createToolCallRequest(middleware, toolCall)
        const handler: ToolCallHandler = async () => {
            throw new Error('Client tool calls should not reach the original handler.')
        }

        const result = await getWrapToolCall(middleware)(request, handler)

        expect(mockInterrupt).toHaveBeenCalledWith({
            clientToolCalls: [toolCall]
        })
        if (!(result instanceof ToolMessage)) {
            throw new Error('Expected a ToolMessage result.')
        }
        expect(result.tool_call_id).toBe('client-call-1')
        expect(result.name).toBe('client_tool')
        expect(result.content).toBe(JSON.stringify({ ok: true }))
        expect(result.status).toBe('success')
        expect(mockDispatchCustomEvent).toHaveBeenCalledTimes(2)
        expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
            1,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'client-call-1',
                tool_call_id: 'client-call-1',
                category: 'Tool',
                type: ChatMessageStepCategory.Program,
                toolset: 'ClientToolMiddleware',
                tool: 'client_tool',
                title: 'client_tool',
                status: 'running',
                input: {
                    text: 'hello'
                },
                created_date: expect.any(Date),
                end_date: null
            })
        )
        expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
            2,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'client-call-1',
                tool_call_id: 'client-call-1',
                category: 'Tool',
                type: ChatMessageStepCategory.Program,
                toolset: 'ClientToolMiddleware',
                tool: 'client_tool',
                title: 'client_tool',
                status: 'success',
                input: {
                    text: 'hello'
                },
                output: JSON.stringify({ ok: true }),
                created_date: expect.any(Date),
                end_date: expect.any(Date)
            })
        )
    })

    it('bubbles GraphInterrupt without marking the client tool as failed', async () => {
        const graphInterrupt = new GraphInterrupt()
        mockInterrupt.mockImplementation(() => {
            throw graphInterrupt
        })

        const middleware = await createClientToolAgentMiddleware({
            emitToolMessages: true
        })
        const toolCall: ToolCall = {
            type: 'tool_call',
            id: 'client-call-1',
            name: 'client_tool',
            args: {
                text: 'hello'
            }
        }
        const request = createToolCallRequest(middleware, toolCall)
        let handlerCalled = false
        const handler: ToolCallHandler = async () => {
            handlerCalled = true
            return new ToolMessage({
                content: 'unused',
                name: 'client_tool',
                tool_call_id: 'client-call-1'
            })
        }

        await expect(getWrapToolCall(middleware)(request, handler)).rejects.toBe(graphInterrupt)

        expect(handlerCalled).toBe(false)
        expect(mockDispatchCustomEvent).toHaveBeenCalledTimes(1)
        expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
            1,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'client-call-1',
                tool_call_id: 'client-call-1',
                category: 'Tool',
                type: ChatMessageStepCategory.Program,
                toolset: 'ClientToolMiddleware',
                tool: 'client_tool',
                title: 'client_tool',
                status: 'running',
                input: {
                    text: 'hello'
                },
                created_date: expect.any(Date),
                end_date: null
            })
        )
    })

    it('emits tool call message labels from tool args', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'client-call-1',
                    name: 'client_tool',
                    content: {
                        ok: true
                    },
                    status: 'success'
                }
            ]
        })
        const middleware = await createClientToolAgentMiddleware({
            emitToolMessages: true
        })
        const request = createToolCallRequest(middleware, {
            type: 'tool_call',
            id: 'client-call-1',
            name: 'client_tool',
            args: {
                text: 'hello',
                message: 'Click the bottom Execute button'
            }
        })
        const handler: ToolCallHandler = async () => {
            throw new Error('Client tool calls should not reach the original handler.')
        }

        await getWrapToolCall(middleware)(request, handler)

        expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
            1,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                message: 'Click the bottom Execute button',
                status: 'running'
            })
        )
        expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
            2,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                message: 'Click the bottom Execute button',
                status: 'success'
            })
        )
    })

    it('rejects client responses without exactly one tool message', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: []
        })

        const middleware = await createClientToolAgentMiddleware()
        const request = createToolCallRequest(middleware, {
            type: 'tool_call',
            id: 'client-call-1',
            name: 'client_tool',
            args: {}
        })
        const handler: ToolCallHandler = async () =>
            new ToolMessage({
                content: 'unused',
                name: 'client_tool',
                tool_call_id: 'client-call-1'
            })

        await expect(getWrapToolCall(middleware)(request, handler)).rejects.toThrow('exactly one item')
    })

    it('rejects client responses with a mismatched tool_call_id', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'other-call',
                    content: 'wrong id'
                }
            ]
        })

        const middleware = await createClientToolAgentMiddleware()
        const request = createToolCallRequest(middleware, {
            type: 'tool_call',
            id: 'client-call-1',
            name: 'client_tool',
            args: {}
        })
        const handler: ToolCallHandler = async () =>
            new ToolMessage({
                content: 'unused',
                name: 'client_tool',
                tool_call_id: 'client-call-1'
            })

        await expect(getWrapToolCall(middleware)(request, handler)).rejects.toThrow('does not match')
    })
})
