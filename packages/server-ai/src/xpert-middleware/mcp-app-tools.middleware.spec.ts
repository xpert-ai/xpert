const mockInterrupt = jest.fn()
const mockDispatchCustomEvent = jest.fn()

jest.mock('@langchain/langgraph', () => ({
    ...jest.requireActual('@langchain/langgraph'),
    interrupt: (...args: unknown[]) => mockInterrupt(...args)
}))
jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: (...args: unknown[]) => mockDispatchCustomEvent(...args)
}))

import { ToolMessage } from '@langchain/core/messages'
import type { ToolCall } from '@langchain/core/messages/tool'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { MCP_APP_TOOLS_LIST, MCP_APP_TOOL_CALL } from '@xpert-ai/chatkit-types'
import { ChatMessageEventTypeEnum, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { ClientToolMiddleware } from './client-tool.middleware'
import { MCP_APP_TOOLS_MIDDLEWARE, McpAppToolsMiddleware } from './mcp-app-tools.middleware'
import { XpertMiddlewareModule } from './xpert-middleware.module'

function context(): IAgentMiddlewareContext {
    return {
        tenantId: 'tenant',
        userId: 'user',
        tools: new Map(),
        node: { id: 'apps', key: 'apps', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: MCP_APP_TOOLS_MIDDLEWARE },
        runtime: {
            async createModelClient() {
                throw new Error('No model is needed for App tools')
            },
            async wrapWorkflowNodeExecution(run) {
                return (await run({})).state
            }
        }
    }
}

describe('McpAppToolsMiddleware', () => {
    beforeEach(() => {
        mockInterrupt.mockReset()
        mockDispatchCustomEvent.mockReset().mockResolvedValue(undefined)
    })

    it('registers and injects the shared client-tool executor', async () => {
        const providers: unknown[] = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, XpertMiddlewareModule)
        const exports: unknown[] = Reflect.getMetadata(MODULE_METADATA.EXPORTS, XpertMiddlewareModule)
        expect(providers).toEqual(expect.arrayContaining([McpAppToolsMiddleware, ClientToolMiddleware]))
        expect(exports).toContain(McpAppToolsMiddleware)
        const module = await Test.createTestingModule({
            providers: [McpAppToolsMiddleware, ClientToolMiddleware]
        }).compile()
        try {
            const strategy = module.get(McpAppToolsMiddleware)
            const middleware = await strategy.createMiddleware({ clientTools: [{ name: 'injected_tool' }] }, context())
            expect(strategy.getToolNames()).toEqual([MCP_APP_TOOLS_LIST, MCP_APP_TOOL_CALL])
            expect(middleware.tools?.map((tool) => (typeof tool === 'string' ? tool : tool.name))).toEqual(
                strategy.getToolNames()
            )
        } finally {
            await module.close()
        }
    })

    it.each([MCP_APP_TOOLS_LIST, MCP_APP_TOOL_CALL])(
        'routes %s through client interruption and shows App metadata',
        async (name) => {
            const strategy = new McpAppToolsMiddleware(new ClientToolMiddleware())
            const middleware = await strategy.createMiddleware({}, context())
            const tool = middleware.tools?.find((candidate) => typeof candidate !== 'string' && candidate.name === name)
            if (!tool || !middleware.wrapToolCall) throw new Error('Expected a client-tool wrapper')
            const toolCall: ToolCall = {
                type: 'tool_call',
                id: 'call-1',
                name,
                args: name === MCP_APP_TOOL_CALL ? { viewId: 'view-1', name: 'edit', arguments: {} } : {}
            }
            mockInterrupt.mockResolvedValue({
                toolMessages: [{ tool_call_id: 'call-1', name, content: { ok: true }, status: 'success' }]
            })
            const handler = jest.fn(async () => {
                throw new Error('App view tools must execute in ChatKit')
            })
            const result = await middleware.wrapToolCall(
                { toolCall, tool, state: { messages: [] }, runtime: {} },
                handler
            )
            expect(handler).not.toHaveBeenCalled()
            expect(mockInterrupt).toHaveBeenCalledWith({ clientToolCalls: [toolCall] })
            expect(result).toBeInstanceOf(ToolMessage)
            expect(result).toMatchObject({
                tool_call_id: 'call-1',
                name,
                content: JSON.stringify({ ok: true }),
                status: 'success'
            })
            for (const [index, status] of ['running', 'success'].entries()) {
                expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
                    index + 1,
                    ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
                    expect.objectContaining({
                        toolset: MCP_APP_TOOLS_MIDDLEWARE,
                        tool: name,
                        icon: strategy.meta.icon,
                        status
                    })
                )
            }
        }
    )
})
