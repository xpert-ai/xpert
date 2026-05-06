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
import { ChatMessageEventTypeEnum, IWFNMiddleware, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddleware, AgentMiddlewareRuntimeApi, IAgentMiddlewareContext, JsonSchemaValidator } from '@xpert-ai/plugin-sdk'
import {
    BrowserAutomationMiddleware,
    BROWSER_AUTOMATION_TOOL_NAMES,
    BROWSER_AUTOMATION_CLIENT_TOOLS,
    BROWSER_AUTOMATION_MIDDLEWARE_NAME,
    HOST_PAGE_WAIT_TOOL_NAME
} from './browser-automation.middleware'

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
        provider: BROWSER_AUTOMATION_MIDDLEWARE_NAME
    }

    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        node,
        tools: new Map(),
        runtime: createRuntime()
    }
}

function getFirstTool(middleware: AgentMiddleware) {
    const firstTool = middleware.tools?.[0]
    if (!firstTool) {
        throw new Error('Expected middleware to expose a tool.')
    }

    return firstTool
}

function getTool(middleware: AgentMiddleware, name: string): NonNullable<AgentMiddleware['tools']>[number] {
    const found = middleware.tools?.find((toolItem) => toolItem.name === name)
    if (!found) {
        throw new Error(`Expected middleware to expose ${name}.`)
    }

    return found
}

function getWrapToolCall(middleware: AgentMiddleware): NonNullable<AgentMiddleware['wrapToolCall']> {
    if (!middleware.wrapToolCall) {
        throw new Error('Expected middleware to expose wrapToolCall.')
    }

    return middleware.wrapToolCall
}

async function flushPromises() {
    for (let index = 0; index < 5; index += 1) {
        await Promise.resolve()
    }
}

describe('BrowserAutomationMiddleware', () => {
    beforeEach(() => {
        mockInterrupt.mockReset()
        mockDispatchCustomEvent.mockReset()
        mockDispatchCustomEvent.mockResolvedValue(undefined)
    })

    it('exposes the fixed host page automation tool set by default', async () => {
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())

        expect(middleware.name).toBe(BROWSER_AUTOMATION_MIDDLEWARE_NAME)
        expect(middleware.tools?.map((tool) => tool.name)).toEqual([...BROWSER_AUTOMATION_TOOL_NAMES])
        expect(middleware.wrapToolCall).toBeDefined()
    })

    it('hides navigation when allowNavigation is false', async () => {
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware(
            {
                allowNavigation: false
            },
            createContext()
        )

        expect(middleware.tools?.map((tool) => tool.name)).toEqual(
            BROWSER_AUTOMATION_TOOL_NAMES.filter((toolName) => toolName !== 'host_page_navigate')
        )
    })

    it('keeps all declared client tool schemas valid JSON schema', async () => {
        const validator = new JsonSchemaValidator()

        for (const toolItem of BROWSER_AUTOMATION_CLIENT_TOOLS) {
            expect(() => validator.parseAndValidate(toolItem.schema)).not.toThrow()
        }
    })

    it('emits browser automation display metadata for host page tool calls', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'host-call-1',
                    content: {
                        ok: true
                    },
                    status: 'success'
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'host-call-1',
                    name: 'host_page_snapshot',
                    args: {}
                },
                tool: getFirstTool(middleware),
                state: {
                    messages: []
                },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_snapshot',
                    tool_call_id: 'host-call-1'
                })
        )

        expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
            1,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'host-call-1',
                category: 'Tool',
                toolset: BROWSER_AUTOMATION_MIDDLEWARE_NAME,
                tool: 'host_page_snapshot',
                title: 'host_page_snapshot',
                status: 'running',
                input: {}
            })
        )
    })

    it('runs host_page_wait on the server and emits tool message metadata', async () => {
        jest.useFakeTimers()

        try {
            const strategy = new BrowserAutomationMiddleware()
            const middleware = await strategy.createMiddleware({}, createContext())
            const waitTool = getTool(middleware, HOST_PAGE_WAIT_TOOL_NAME)

            const result = waitTool.invoke(
                {
                    seconds: 3
                },
                {
                    metadata: {
                        tool_call_id: 'wait-call-1'
                    }
                }
            )

            await flushPromises()
            expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
                1,
                ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
                expect.objectContaining({
                    id: 'wait-call-1',
                    category: 'Tool',
                    toolset: BROWSER_AUTOMATION_MIDDLEWARE_NAME,
                    tool: HOST_PAGE_WAIT_TOOL_NAME,
                    title: HOST_PAGE_WAIT_TOOL_NAME,
                    status: 'running',
                    input: {
                        seconds: 3
                    }
                })
            )

            jest.advanceTimersByTime(3_000)
            await expect(result).resolves.toBe('Waited 3 seconds.')
            expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
                2,
                ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
                expect.objectContaining({
                    id: 'wait-call-1',
                    category: 'Tool',
                    toolset: BROWSER_AUTOMATION_MIDDLEWARE_NAME,
                    tool: HOST_PAGE_WAIT_TOOL_NAME,
                    title: HOST_PAGE_WAIT_TOOL_NAME,
                    status: 'success',
                    input: {
                        seconds: 3
                    },
                    output: 'Waited 3 seconds.'
                })
            )
        } finally {
            jest.useRealTimers()
        }
    })

    it('validates host_page_wait duration bounds', async () => {
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const waitTool = getTool(middleware, HOST_PAGE_WAIT_TOOL_NAME)

        await expect(waitTool.invoke({ seconds: 2 })).rejects.toThrow()
        await expect(waitTool.invoke({ seconds: 61 })).rejects.toThrow()
    })
})
