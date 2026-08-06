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

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { ChatMessageEventTypeEnum, IWFNMiddleware, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import {
    AgentMiddleware,
    AgentMiddlewareRuntimeApi,
    IAgentMiddlewareContext,
    JsonSchemaValidator
} from '@xpert-ai/plugin-sdk'
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

function readStringField(value: unknown, field: string): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Expected payload object with string field ${field}.`)
    }

    const fieldValue = Reflect.get(value, field)
    if (typeof fieldValue !== 'string') {
        throw new Error(`Expected string field ${field}.`)
    }

    return fieldValue
}

function readObjectField(value: unknown, field: string): object {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Expected payload object with object field ${field}.`)
    }

    const fieldValue = Reflect.get(value, field)
    if (!fieldValue || typeof fieldValue !== 'object' || Array.isArray(fieldValue)) {
        throw new Error(`Expected object field ${field}.`)
    }

    return fieldValue
}

function parseJsonContent(value: unknown): object {
    const content = readStringField(value, 'content')
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected JSON object content.')
    }

    return parsed
}

function readRecordField(value: unknown, field: string): object {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Expected payload object with object field ${field}.`)
    }

    const fieldValue = Reflect.get(value, field)
    if (!fieldValue || typeof fieldValue !== 'object' || Array.isArray(fieldValue)) {
        throw new Error(`Expected object field ${field}.`)
    }

    return fieldValue
}

function readArrayField(value: unknown, field: string): unknown[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Expected payload object with array field ${field}.`)
    }

    const fieldValue = Reflect.get(value, field)
    if (!Array.isArray(fieldValue)) {
        throw new Error(`Expected array field ${field}.`)
    }

    return fieldValue
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

    it('keeps declared client tool schemas compatible with OpenAI function parameters', () => {
        const unsupportedTopLevelKeywords = ['oneOf', 'anyOf', 'allOf', 'enum', 'not'] as const

        for (const toolItem of BROWSER_AUTOMATION_CLIENT_TOOLS) {
            const schema = JSON.parse(toolItem.schema ?? '{}')

            expect(schema.type).toBe('object')
            for (const keyword of unsupportedTopLevelKeywords) {
                expect(schema).not.toHaveProperty(keyword)
            }
        }
    })

    it('exposes host_page_snapshot pagination parameters', () => {
        const snapshotTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_snapshot')
        const snapshotSchema = JSON.parse(snapshotTool?.schema ?? '{}')

        expect(snapshotSchema.properties).toEqual(
            expect.objectContaining({
                page: expect.objectContaining({
                    type: 'number',
                    minimum: 1
                }),
                pageSize: expect.objectContaining({
                    type: 'number',
                    minimum: 1,
                    maximum: 100
                }),
                snapshotId: expect.objectContaining({
                    type: 'string'
                }),
                pageStateId: expect.objectContaining({
                    type: 'string'
                }),
                includeIndex: expect.objectContaining({
                    type: 'boolean'
                })
            })
        )
    })

    it('describes how agents should use paginated host_page_snapshot results', () => {
        const snapshotTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_snapshot')

        expect(snapshotTool?.description).toContain('_xpertPagination')
        expect(snapshotTool?.description).toContain('criticalElements')
        expect(snapshotTool?.description).toContain('snapshotId')
        expect(snapshotTool?.description).toContain('includeIndex=false')
        expect(snapshotTool?.description).toContain('readableContent')
        expect(snapshotTool?.description).toContain('outline')
        expect(snapshotTool?.description).toContain('suggestedReads')
        expect(snapshotTool?.description).toContain('host_page_read')
        expect(snapshotTool?.description).toContain('target_occluded')
    })

    it('exposes host_page_read for paginated readable content retrieval', () => {
        const readTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_read')
        const readSchema = JSON.parse(readTool?.schema ?? '{}')

        expect(readTool?.description).toContain('readableContent')
        expect(readTool?.description).toContain('blockId')
        expect(readSchema.properties).not.toHaveProperty('snapshotId')
        expect(readSchema.properties).toEqual(
            expect.objectContaining({
                blockId: expect.objectContaining({
                    type: 'string'
                }),
                scope: expect.objectContaining({
                    type: 'string',
                    enum: ['visible']
                }),
                query: expect.objectContaining({
                    type: 'string'
                }),
                page: expect.objectContaining({
                    type: 'number',
                    minimum: 1
                }),
                pageSize: expect.objectContaining({
                    type: 'number',
                    minimum: 1,
                    maximum: 100
                }),
                maxChars: expect.objectContaining({
                    type: 'number',
                    minimum: 500,
                    maximum: 12000
                })
            })
        )
    })

    it('compacts large host_page_read results to the requested maxChars budget', async () => {
        const rawRead = {
            ok: true,
            result: {
                scope: 'visible',
                blocks: Array.from({ length: 24 }, (_, index) => ({
                    blockId: `b${index + 1}`,
                    type: 'list',
                    heading: `Readable block ${index + 1}`,
                    items: Array.from(
                        { length: 12 },
                        (__, itemIndex) => `Item ${index}.${itemIndex} ${'long content '.repeat(40)}`
                    ),
                    preview: [`Item ${index}.0`],
                    itemCount: 12,
                    chars: 9_000,
                    truncated: true,
                    readHint: {
                        tool: 'host_page_read',
                        args: {
                            blockId: `b${index + 1}`
                        }
                    }
                })),
                page: 1,
                pageSize: 24,
                pageCount: 1,
                coverage: {
                    status: 'partial',
                    visibleTextCaptured: true,
                    truncatedBlocks: 24,
                    collapsedSections: 0,
                    crossOriginFrames: 0,
                    virtualizedListsDetected: 0,
                    visualOnlyRegions: 0
                }
            }
        }
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'read-call-1',
                    content: rawRead,
                    status: 'success'
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'read-call-1',
                    name: 'host_page_read',
                    args: {
                        pageSize: 24,
                        maxChars: 500
                    }
                },
                tool: getTool(middleware, 'host_page_read'),
                state: {
                    messages: []
                },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_read',
                    tool_call_id: 'read-call-1'
                })
        )

        const compactedContent = readStringField(result, 'content')
        expect(compactedContent.length).toBeLessThanOrEqual(500)
        expect(compactedContent).not.toContain('long content long content long content')

        const payload = parseJsonContent(result)
        const resultPayload = readRecordField(payload, 'result')
        expect(resultPayload).toEqual(
            expect.objectContaining({
                truncated: true,
                _xpertCompaction: expect.objectContaining({
                    compacted: true
                })
            })
        )
    })

    it('exposes rich browser automation targeting schemas', () => {
        const clickTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_click')
        const fillTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_fill')
        const selectTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_select')
        const screenshotTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_screenshot')
        const pointerTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_pointer')
        const waitForTool = BROWSER_AUTOMATION_CLIENT_TOOLS.find((tool) => tool.name === 'host_page_wait_for')

        expect(clickTool).toBeDefined()
        expect(fillTool).toBeDefined()
        expect(selectTool).toBeDefined()
        expect(screenshotTool).toBeDefined()
        expect(pointerTool).toBeDefined()
        expect(waitForTool).toBeDefined()

        const clickSchema = JSON.parse(clickTool?.schema ?? '{}')
        expect(clickSchema.properties).toEqual(
            expect.objectContaining({
                pageStateId: expect.any(Object),
                documentRef: expect.any(Object),
                axRef: expect.any(Object),
                role: expect.any(Object),
                name: expect.any(Object),
                testId: expect.any(Object),
                strategy: expect.any(Object),
                expectation: expect.any(Object),
                message: expect.objectContaining({
                    type: 'string'
                })
            })
        )
        expect(clickSchema.properties).not.toHaveProperty('x')
        expect(clickSchema.properties).not.toHaveProperty('y')
        expect(clickSchema.properties).not.toHaveProperty('actionToken')
        expect(clickSchema.properties.expectation.properties.target.properties.identity.required).toEqual(['role'])
        expect(clickSchema.required).toContain('message')
        const fillSchema = JSON.parse(fillTool?.schema ?? '{}')
        expect(fillSchema.properties).not.toHaveProperty('actionToken')
        expect(fillSchema.properties.message).toEqual(
            expect.objectContaining({
                type: 'string'
            })
        )
        expect(fillSchema.required).toEqual(expect.arrayContaining(['value', 'message']))
        const selectSchema = JSON.parse(selectTool?.schema ?? '{}')
        expect(selectSchema.properties).toEqual(
            expect.objectContaining({
                values: expect.objectContaining({
                    type: 'array',
                    items: expect.objectContaining({
                        type: 'string'
                    })
                })
            })
        )
        expect(selectSchema.properties).not.toHaveProperty('value')
        expect(selectSchema.required).toEqual(['values'])
        const pointerSchema = JSON.parse(pointerTool?.schema ?? '{}')
        expect(pointerSchema.properties).not.toHaveProperty('actionToken')
        expect(pointerSchema.properties).toEqual(
            expect.objectContaining({
                pageStateId: expect.any(Object),
                documentRef: expect.any(Object),
                x: expect.any(Object),
                y: expect.any(Object),
                coordinateSpace: expect.objectContaining({
                    enum: ['viewport-css-px', 'viewport_normalized']
                }),
                targetText: expect.any(Object),
                targetRole: expect.any(Object),
                targetContext: expect.any(Object),
                expectation: expect.any(Object)
            })
        )
        expect(pointerSchema.properties.button).toEqual(
            expect.objectContaining({
                type: 'string',
                enum: ['left', 'middle', 'right']
            })
        )
        expect(pointerSchema.properties.clickCount).toEqual(
            expect.objectContaining({
                minimum: 1,
                maximum: 3
            })
        )
        expect(pointerSchema.properties.message).toEqual(
            expect.objectContaining({
                type: 'string'
            })
        )
        expect(pointerSchema.required).toContain('message')
    })

    it('rejects a v2 action without the latest snapshot page state before interrupting the client', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'click-call-missing-state',
                    name: 'host_page_click',
                    status: 'success',
                    content: { ok: true, result: { clicked: { name: 'Save' } } }
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)
        const snapshotMessage = new ToolMessage({
            name: 'host_page_snapshot',
            tool_call_id: 'snapshot-call-v2',
            content: JSON.stringify({
                ok: true,
                result: {
                    pageStateId: 'ps-v2',
                    capabilities: {
                        targetingVersion: 2,
                        strictRefs: true,
                        freshState: true
                    }
                }
            })
        })

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'click-call-missing-state',
                    name: 'host_page_click',
                    args: {
                        documentRef: 'd1',
                        ref: 'e1',
                        message: 'Click Save'
                    }
                },
                tool: getTool(middleware, 'host_page_click'),
                state: { messages: [snapshotMessage] },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_click',
                    tool_call_id: 'click-call-missing-state'
                })
        )

        expect(mockInterrupt).not.toHaveBeenCalled()
        expect(readStringField(result, 'status')).toBe('error')
        expect(parseJsonContent(result)).toEqual(
            expect.objectContaining({
                code: 'stale_page_state',
                dispatched: false,
                outcome: 'rejected_before_execution',
                requiresFreshSnapshot: true,
                invalidatedPageStateId: 'ps-v2'
            })
        )
    })

    it('binds the latest fresh v2 page state to navigation when the model omits it', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'navigate-call-missing-state',
                    name: 'host_page_navigate',
                    status: 'success',
                    content: {
                        ok: true,
                        result: {
                            navigated: 'https://xpertai.cn/apps/',
                            outcome: 'executed_unverified'
                        }
                    }
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)
        const snapshotMessage = new ToolMessage({
            name: 'host_page_snapshot',
            tool_call_id: 'snapshot-before-navigation',
            content: JSON.stringify({
                ok: true,
                result: {
                    pageStateId: 'ps-before-navigation',
                    capabilities: { targetingVersion: 2 }
                }
            })
        })

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'navigate-call-missing-state',
                    name: 'host_page_navigate',
                    args: {
                        url: 'https://xpertai.cn/apps/'
                    }
                },
                tool: getTool(middleware, 'host_page_navigate'),
                state: { messages: [snapshotMessage] },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_navigate',
                    tool_call_id: 'navigate-call-missing-state'
                })
        )

        expect(mockInterrupt).toHaveBeenCalledTimes(1)
        expect(mockInterrupt).toHaveBeenCalledWith({
            clientToolCalls: [
                {
                    type: 'tool_call',
                    id: 'navigate-call-missing-state',
                    name: 'host_page_navigate',
                    args: {
                        url: 'https://xpertai.cn/apps/',
                        pageStateId: 'ps-before-navigation'
                    }
                }
            ]
        })
        expect(readStringField(result, 'status')).toBe('success')
    })

    it('rejects navigation with an explicit page state that does not match the latest v2 snapshot', async () => {
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)
        const snapshotMessage = new ToolMessage({
            name: 'host_page_snapshot',
            tool_call_id: 'snapshot-before-mismatched-navigation',
            content: JSON.stringify({
                ok: true,
                result: {
                    pageStateId: 'ps-latest-navigation',
                    capabilities: { targetingVersion: 2 }
                }
            })
        })

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'navigate-call-mismatched-state',
                    name: 'host_page_navigate',
                    args: {
                        url: 'https://xpertai.cn/apps/',
                        pageStateId: 'ps-old-navigation'
                    }
                },
                tool: getTool(middleware, 'host_page_navigate'),
                state: { messages: [snapshotMessage] },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_navigate',
                    tool_call_id: 'navigate-call-mismatched-state'
                })
        )

        expect(mockInterrupt).not.toHaveBeenCalled()
        expect(readStringField(result, 'status')).toBe('error')
        expect(parseJsonContent(result)).toEqual(
            expect.objectContaining({
                code: 'stale_page_state',
                dispatched: false,
                outcome: 'rejected_before_execution',
                requiresFreshSnapshot: true,
                invalidatedPageStateId: 'ps-latest-navigation'
            })
        )
    })

    it('rejects a v2 target action without a document scope before interrupting the client', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'click-call-missing-document',
                    name: 'host_page_click',
                    status: 'success',
                    content: { ok: true, result: { clicked: { name: 'Save' } } }
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)
        const snapshotMessage = new ToolMessage({
            name: 'host_page_snapshot',
            tool_call_id: 'snapshot-call-v2-document',
            content: JSON.stringify({
                ok: true,
                result: {
                    pageStateId: 'ps-v2-document',
                    capabilities: { targetingVersion: 2 }
                }
            })
        })

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'click-call-missing-document',
                    name: 'host_page_click',
                    args: {
                        pageStateId: 'ps-v2-document',
                        ref: 'e1',
                        message: 'Click Save'
                    }
                },
                tool: getTool(middleware, 'host_page_click'),
                state: { messages: [snapshotMessage] },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_click',
                    tool_call_id: 'click-call-missing-document'
                })
        )

        expect(mockInterrupt).not.toHaveBeenCalled()
        expect(readStringField(result, 'status')).toBe('error')
        expect(parseJsonContent(result)).toEqual(
            expect.objectContaining({
                code: 'unsupported_target_scope',
                dispatched: false,
                outcome: 'rejected_before_execution'
            })
        )
    })

    it('requires a fresh v2 snapshot after a dispatched browser action', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'fill-call-after-action',
                    name: 'host_page_fill',
                    status: 'success',
                    content: { ok: true, result: { filled: { name: 'Name' } } }
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)
        const snapshotMessage = new ToolMessage({
            name: 'host_page_snapshot',
            tool_call_id: 'snapshot-call-before-action',
            content: JSON.stringify({
                ok: true,
                result: {
                    pageStateId: 'ps-before-action',
                    capabilities: { targetingVersion: 2 }
                }
            })
        })
        const priorActionMessage = new ToolMessage({
            name: 'host_page_click',
            tool_call_id: 'click-call-before-fill',
            content: JSON.stringify({
                ok: true,
                result: {
                    dispatched: true,
                    outcome: 'executed_unverified',
                    requiresFreshSnapshot: true,
                    invalidatedPageStateId: 'ps-before-action'
                }
            })
        })

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'fill-call-after-action',
                    name: 'host_page_fill',
                    args: {
                        pageStateId: 'ps-before-action',
                        documentRef: 'd1',
                        ref: 'e2',
                        value: 'Grace',
                        message: 'Fill Name'
                    }
                },
                tool: getTool(middleware, 'host_page_fill'),
                state: { messages: [snapshotMessage, priorActionMessage] },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_fill',
                    tool_call_id: 'fill-call-after-action'
                })
        )

        expect(mockInterrupt).not.toHaveBeenCalled()
        expect(readStringField(result, 'status')).toBe('error')
        expect(parseJsonContent(result)).toEqual(
            expect.objectContaining({
                code: 'stale_page_state',
                requiresFreshSnapshot: true,
                invalidatedPageStateId: 'ps-before-action'
            })
        )
    })

    it('keeps legacy actions available after a snapshot without v2 capabilities', async () => {
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'legacy-click-after-snapshot',
                    name: 'host_page_click',
                    status: 'success',
                    content: { ok: true, result: { clicked: { name: 'Save' } } }
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)
        const legacySnapshotMessage = new ToolMessage({
            name: 'host_page_snapshot',
            tool_call_id: 'legacy-snapshot-call',
            content: JSON.stringify({
                ok: true,
                result: { url: 'https://example.com', elements: [] }
            })
        })

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'legacy-click-after-snapshot',
                    name: 'host_page_click',
                    args: { ref: 'e1', message: 'Click Save' }
                },
                tool: getTool(middleware, 'host_page_click'),
                state: { messages: [legacySnapshotMessage] },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_click',
                    tool_call_id: 'legacy-click-after-snapshot'
                })
        )

        expect(mockInterrupt).toHaveBeenCalledTimes(1)
        expect(parseJsonContent(result)).toEqual(
            expect.objectContaining({
                result: expect.objectContaining({
                    outcome: 'executed_unverified',
                    legacyUnverified: true
                })
            })
        )
    })

    it('runs browser approval_required through HITL and retries the unchanged client action', async () => {
        const secret = 'correct horse battery staple'
        mockInterrupt
            .mockResolvedValueOnce({
                toolMessages: [
                    {
                        tool_call_id: 'password-call-1',
                        name: 'host_page_fill',
                        status: 'error',
                        content: {
                            ok: false,
                            code: 'approval_required',
                            actionToken: 'action-token-1',
                            approvalReason: 'approval_required',
                            risks: ['password_input'],
                            expiresAt: '2026-08-05T12:30:00.000Z',
                            dispatched: false,
                            outcome: 'rejected_before_execution'
                        }
                    }
                ]
            })
            .mockResolvedValueOnce({ decisions: [{ type: 'approve' }] })
            .mockResolvedValueOnce({
                toolMessages: [
                    {
                        tool_call_id: 'password-call-1',
                        name: 'host_page_fill',
                        status: 'success',
                        content: {
                            ok: true,
                            result: {
                                dispatched: true,
                                outcome: 'executed_unverified',
                                requiresFreshSnapshot: true
                            }
                        }
                    }
                ]
            })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)
        const toolCall = {
            type: 'tool_call' as const,
            id: 'password-call-1',
            name: 'host_page_fill',
            args: {
                pageStateId: 'ps-1',
                documentRef: 'd1',
                ref: 'e1',
                value: secret,
                message: 'Fill password'
            }
        }

        const result = await wrapToolCall(
            {
                toolCall,
                tool: getTool(middleware, 'host_page_fill'),
                state: { messages: [] },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: toolCall.name,
                    tool_call_id: toolCall.id
                })
        )

        expect(readStringField(result, 'status')).toBe('success')
        expect(parseJsonContent(result)).toEqual(
            expect.objectContaining({
                ok: true,
                result: expect.objectContaining({
                    outcome: 'executed_unverified'
                })
            })
        )
        expect(mockInterrupt).toHaveBeenCalledTimes(3)
        const hitlRequest = mockInterrupt.mock.calls[1]?.[0]
        expect(hitlRequest).toEqual(
            expect.objectContaining({
                actionRequests: [
                    expect.objectContaining({
                        name: 'host_page_fill',
                        args: expect.objectContaining({
                            value: '[REDACTED]'
                        })
                    })
                ],
                reviewConfigs: [
                    expect.objectContaining({
                        actionName: 'host_page_fill',
                        allowedDecisions: ['approve', 'reject']
                    })
                ]
            })
        )
        expect(JSON.stringify(hitlRequest)).not.toContain(secret)
        expect(mockInterrupt.mock.calls[2]?.[0]).toEqual({
            clientToolCalls: [
                {
                    ...toolCall,
                    args: {
                        ...toolCall.args,
                        actionToken: 'action-token-1'
                    }
                }
            ]
        })
    })

    it('returns a rejected tool result without retrying the client action', async () => {
        mockInterrupt
            .mockResolvedValueOnce({
                toolMessages: [
                    {
                        tool_call_id: 'submit-call-1',
                        name: 'host_page_click',
                        status: 'error',
                        content: {
                            ok: false,
                            code: 'approval_required',
                            actionToken: 'action-token-submit',
                            risks: ['form_submit'],
                            dispatched: false,
                            outcome: 'rejected_before_execution'
                        }
                    }
                ]
            })
            .mockResolvedValueOnce({ decisions: [{ type: 'reject', message: 'Do not submit this form.' }] })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'submit-call-1',
                    name: 'host_page_click',
                    args: {
                        pageStateId: 'ps-1',
                        documentRef: 'd1',
                        ref: 'e1',
                        message: 'Submit the form'
                    }
                },
                tool: getTool(middleware, 'host_page_click'),
                state: { messages: [] },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_click',
                    tool_call_id: 'submit-call-1'
                })
        )

        expect(mockInterrupt).toHaveBeenCalledTimes(2)
        expect(readStringField(result, 'status')).toBe('error')
        expect(parseJsonContent(result)).toEqual(
            expect.objectContaining({
                code: 'approval_rejected',
                message: 'Do not submit this form.',
                dispatched: false,
                outcome: 'rejected_before_execution'
            })
        )
    })

    it('marks legacy action success as unverified without rewriting v2 outcomes', async () => {
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)
        const runClick = () =>
            wrapToolCall(
                {
                    toolCall: {
                        type: 'tool_call',
                        id: 'legacy-click-1',
                        name: 'host_page_click',
                        args: { ref: 'e1', message: 'Click Save' }
                    },
                    tool: getTool(middleware, 'host_page_click'),
                    state: { messages: [] },
                    runtime: {}
                },
                async () =>
                    new ToolMessage({
                        content: 'unused',
                        name: 'host_page_click',
                        tool_call_id: 'legacy-click-1'
                    })
            )

        mockInterrupt.mockResolvedValueOnce({
            toolMessages: [
                {
                    tool_call_id: 'legacy-click-1',
                    content: { ok: true, result: { clicked: { name: 'Save' } } },
                    status: 'success'
                }
            ]
        })
        const legacyResult = await runClick()
        expect(parseJsonContent(legacyResult)).toEqual(
            expect.objectContaining({
                result: expect.objectContaining({
                    outcome: 'executed_unverified',
                    legacyUnverified: true
                })
            })
        )

        mockInterrupt.mockResolvedValueOnce({
            toolMessages: [
                {
                    tool_call_id: 'legacy-click-1',
                    content: {
                        ok: true,
                        result: {
                            dispatched: true,
                            outcome: 'verified',
                            requiresFreshSnapshot: true,
                            resolution: { strategy: 'ref', pageStateId: 'ps-1' },
                            verification: { status: 'passed' }
                        }
                    },
                    status: 'success'
                }
            ]
        })
        const v2Result = await runClick()
        const v2Payload = parseJsonContent(v2Result)
        const v2Action = readRecordField(v2Payload, 'result')
        expect(v2Action).toEqual(
            expect.objectContaining({
                outcome: 'verified',
                resolution: { strategy: 'ref', pageStateId: 'ps-1' },
                verification: { status: 'passed' }
            })
        )
        expect(v2Action).not.toHaveProperty('legacyUnverified')
    })

    it('emits default localized display messages for host page tools without model messages', async () => {
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
                    name: 'host_page_screenshot',
                    args: {
                        format: 'png'
                    }
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
                    name: 'host_page_screenshot',
                    tool_call_id: 'host-call-1'
                })
        )

        expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
            1,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                tool: 'host_page_screenshot',
                message: {
                    en_US: 'Capture a page screenshot',
                    zh_Hans: '截取页面截图'
                },
                status: 'running'
            })
        )
        expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
            2,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                tool: 'host_page_screenshot',
                message: {
                    en_US: 'Capture a page screenshot',
                    zh_Hans: '截取页面截图'
                },
                status: 'success'
            })
        )
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
                    name: 'host_page_pointer',
                    args: {
                        x: 820,
                        y: 720,
                        action: 'click',
                        message: 'Click the bottom Execute button'
                    }
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
                    name: 'host_page_pointer',
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
                tool: 'host_page_pointer',
                title: 'host_page_pointer',
                message: 'Click the bottom Execute button',
                status: 'running',
                input: {
                    x: 820,
                    y: 720,
                    action: 'click',
                    message: 'Click the bottom Execute button'
                }
            })
        )
    })

    it('paginates large host_page_snapshot results and keeps critical controls in the index', async () => {
        const textElements = Array.from({ length: 64 }, (_, index) => ({
            documentRef: 'd1',
            ref: `e${index}`,
            role: 'textbox',
            name: `Field ${index} ${'label '.repeat(60)}`,
            nearbyText: Array.from(
                { length: 12 },
                (__, textIndex) => `Nearby ${index}.${textIndex} ${'text '.repeat(40)}`
            ),
            selector: `#field-${index}`,
            rect: {
                x: index,
                y: index * 2,
                width: 320,
                height: 32
            },
            center: {
                x: index + 160,
                y: index * 2 + 16
            },
            hitStack: Array.from({ length: 8 }, (__, stackIndex) => ({
                selector: `.stack-${index}-${stackIndex}`,
                text: 'stack '.repeat(80)
            }))
        }))
        const elements = [
            ...textElements,
            {
                documentRef: 'd1',
                ref: 'e64',
                role: 'checkbox',
                name: '我已阅读并确认遵守公司差旅政策',
                label: '我已阅读并确认遵守公司差旅政策',
                tag: 'input',
                selector: '#promisePolicy',
                checked: false,
                enabled: true,
                visible: true,
                actionable: true,
                rect: {
                    x: 505,
                    y: 1120,
                    width: 20,
                    height: 20
                },
                center: {
                    x: 515,
                    y: 1130
                },
                nearbyText: ['我已阅读并确认遵守公司差旅政策']
            }
        ]
        const rawSnapshot = {
            ok: true,
            result: {
                url: 'https://www.fnbank.net/get-in-touch/careers',
                title: 'Careers',
                pageStateId: 'page-state-1',
                documents: [{ documentRef: 'd1', sameOrigin: true }],
                capabilities: {
                    accessibility: true,
                    cdp: true,
                    networkState: true
                },
                viewport: {
                    width: 1440,
                    height: 900
                },
                scroll: {
                    x: 0,
                    y: 0
                },
                elements
            }
        }
        const rawContent = JSON.stringify(rawSnapshot)
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'snapshot-call-1',
                    content: rawSnapshot,
                    status: 'success'
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'snapshot-call-1',
                    name: 'host_page_snapshot',
                    args: {
                        mode: 'rich',
                        maxElements: 250,
                        pageSize: 30
                    }
                },
                tool: getTool(middleware, 'host_page_snapshot'),
                state: {
                    messages: []
                },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_snapshot',
                    tool_call_id: 'snapshot-call-1'
                })
        )

        expect(result).toBeInstanceOf(ToolMessage)
        const compactedContent = readStringField(result, 'content')
        expect(compactedContent.length).toBeLessThan(rawContent.length)
        expect(compactedContent.length).toBeLessThanOrEqual(24_000)
        expect(compactedContent).toContain('_xpertPagination')
        expect(compactedContent).not.toContain('stack stack stack stack stack')

        const payload = parseJsonContent(result)
        const resultPayload = readRecordField(payload, 'result')
        const pagination = readRecordField(resultPayload, '_xpertPagination')
        expect(pagination).toEqual(
            expect.objectContaining({
                pageStateId: 'page-state-1',
                page: 1,
                pageSize: 30,
                pageCount: 3,
                totalElements: 65,
                indexIncluded: true
            })
        )
        expect(typeof Reflect.get(pagination, 'snapshotId')).toBe('string')
        expect(readArrayField(resultPayload, 'pages')).toHaveLength(3)
        expect(readArrayField(resultPayload, 'elements')).toHaveLength(30)
        expect(Reflect.get(resultPayload, 'pageStateId')).toBe('page-state-1')
        expect(readArrayField(resultPayload, 'documents')).toEqual([
            expect.objectContaining({ documentRef: 'd1', sameOrigin: true })
        ])
        expect(readArrayField(resultPayload, 'elements')[0]).toEqual(expect.objectContaining({ documentRef: 'd1' }))
        expect(JSON.stringify(readArrayField(resultPayload, 'elements'))).not.toContain('#promisePolicy')
        expect(JSON.stringify(readArrayField(resultPayload, 'criticalElements'))).toContain('#promisePolicy')

        const successPayload = mockDispatchCustomEvent.mock.calls[1]?.[1]
        const emittedOutput = readStringField(successPayload, 'output')
        expect(emittedOutput).toBe(compactedContent)
    })

    it('compacts readableContent summaries while preserving read hints', async () => {
        const readableBlocks = Array.from({ length: 32 }, (_, blockIndex) => ({
            blockId: `b${blockIndex + 1}`,
            type: 'keyValueList',
            heading: `Details ${blockIndex}`,
            fields: Array.from({ length: 18 }, (__, fieldIndex) => ({
                name: `Field ${blockIndex}.${fieldIndex}`,
                value: `Value ${blockIndex}.${fieldIndex} ${'long text '.repeat(60)}`
            })),
            preview: [`Field ${blockIndex}.0: Value ${blockIndex}.0`],
            itemCount: 18,
            chars: 12_000,
            truncated: true,
            readHint: {
                tool: 'host_page_read',
                args: {
                    blockId: `b${blockIndex + 1}`
                }
            }
        }))
        const rawSnapshot = {
            ok: true,
            result: {
                url: 'https://example.com/product',
                title: 'Product',
                readableContent: {
                    blocks: readableBlocks,
                    outline: readableBlocks.map((block, index) => ({
                        index,
                        blockId: block.blockId,
                        type: block.type,
                        heading: block.heading,
                        itemCount: block.itemCount,
                        chars: block.chars,
                        truncated: block.truncated
                    })),
                    suggestedReads: readableBlocks.slice(0, 14).map((block) => ({
                        blockId: block.blockId,
                        type: block.type,
                        heading: block.heading,
                        reason: 'structured_fields',
                        args: {
                            blockId: block.blockId,
                            pageSize: 18
                        }
                    })),
                    totalBlocks: readableBlocks.length,
                    truncated: true,
                    coverage: {
                        status: 'partial',
                        visibleTextCaptured: true,
                        truncatedBlocks: readableBlocks.length,
                        collapsedSections: 1,
                        crossOriginFrames: 0,
                        virtualizedListsDetected: 0,
                        visualOnlyRegions: 0
                    },
                    warnings: ['Some content is inside collapsed sections.']
                },
                elements: [
                    {
                        ref: 'e1',
                        role: 'button',
                        name: 'Buy now',
                        selector: '#buy',
                        enabled: true,
                        visible: true,
                        actionable: true,
                        receivesEvents: true,
                        safeClickPoints: [{ x: 10, y: 20 }]
                    }
                ]
            }
        }
        const rawContent = JSON.stringify(rawSnapshot)
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'snapshot-call-1',
                    content: rawSnapshot,
                    status: 'success'
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'snapshot-call-1',
                    name: 'host_page_snapshot',
                    args: {
                        mode: 'rich',
                        pageSize: 30
                    }
                },
                tool: getTool(middleware, 'host_page_snapshot'),
                state: {
                    messages: []
                },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_snapshot',
                    tool_call_id: 'snapshot-call-1'
                })
        )

        const compactedContent = readStringField(result, 'content')
        expect(compactedContent.length).toBeLessThan(rawContent.length)
        expect(compactedContent.length).toBeLessThanOrEqual(24_000)
        expect(compactedContent).not.toContain('long text '.repeat(20).trim())

        const payload = parseJsonContent(result)
        const resultPayload = readRecordField(payload, 'result')
        const readableContent = readRecordField(resultPayload, 'readableContent')
        const blocks = readArrayField(readableContent, 'blocks')
        const outline = readArrayField(readableContent, 'outline')
        const suggestedReads = readArrayField(readableContent, 'suggestedReads')

        expect(blocks).toHaveLength(16)
        expect(Reflect.get(readableContent, '_truncatedBlocks')).toBe(16)
        expect(outline).toHaveLength(32)
        expect(JSON.stringify(outline)).toContain('b32')
        expect(JSON.stringify(outline)).not.toContain('long text')
        expect(suggestedReads).toHaveLength(12)
        expect(Reflect.get(readableContent, '_truncatedSuggestedReads')).toBe(2)
        expect(readArrayField(blocks[0], 'fields')).toHaveLength(4)
        expect(blocks[0]).toEqual(
            expect.objectContaining({
                _truncatedFields: 14,
                readHint: {
                    tool: 'host_page_read',
                    args: {
                        blockId: 'b1'
                    }
                }
            })
        )
    })

    it('returns the requested host_page_snapshot page without the index by default', async () => {
        const elements = Array.from({ length: 65 }, (_, index) => ({
            ref: `e${index}`,
            role: 'textbox',
            name: `Field ${index}`,
            selector: `#field-${index}`,
            enabled: true,
            visible: true,
            actionable: true
        }))
        const rawSnapshot = {
            ok: true,
            result: {
                url: 'https://example.com/form',
                title: 'Paged form',
                elements
            }
        }
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'snapshot-call-1',
                    content: rawSnapshot,
                    status: 'success'
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'snapshot-call-1',
                    name: 'host_page_snapshot',
                    args: {
                        snapshotId: 'snapshot-previous',
                        page: 3,
                        pageSize: 30
                    }
                },
                tool: getTool(middleware, 'host_page_snapshot'),
                state: {
                    messages: []
                },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_snapshot',
                    tool_call_id: 'snapshot-call-1'
                })
        )

        const payload = parseJsonContent(result)
        const resultPayload = readRecordField(payload, 'result')
        const pagination = readRecordField(resultPayload, '_xpertPagination')
        const pageElements = readArrayField(resultPayload, 'elements')

        expect(pagination).toEqual(
            expect.objectContaining({
                snapshotId: 'snapshot-previous',
                page: 3,
                pageSize: 30,
                pageCount: 3,
                totalElements: 65,
                indexIncluded: false
            })
        )
        expect(pageElements).toHaveLength(5)
        expect(pageElements[0]).toEqual(expect.objectContaining({ ref: 'e60' }))
        expect(resultPayload).not.toHaveProperty('pages')
        expect(resultPayload).not.toHaveProperty('criticalElements')
    })

    it('leaves already paginated host_page_snapshot responses unchanged when they fit the content budget', async () => {
        const rawSnapshot = {
            ok: true,
            result: {
                url: 'https://example.com/form',
                title: 'Paged form',
                elements: [
                    {
                        ref: 'e60',
                        role: 'textbox',
                        name: 'Field 60',
                        selector: '#field-60'
                    }
                ],
                _xpertPagination: {
                    snapshotId: 'snapshot-client',
                    page: 3,
                    pageSize: 30,
                    pageCount: 3,
                    totalElements: 65,
                    indexIncluded: false
                }
            }
        }
        const rawContent = JSON.stringify(rawSnapshot)
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'snapshot-call-1',
                    content: rawSnapshot,
                    status: 'success'
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'snapshot-call-1',
                    name: 'host_page_snapshot',
                    args: {
                        snapshotId: 'snapshot-client',
                        page: 3,
                        pageSize: 30
                    }
                },
                tool: getTool(middleware, 'host_page_snapshot'),
                state: {
                    messages: []
                },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_snapshot',
                    tool_call_id: 'snapshot-call-1'
                })
        )

        expect(readStringField(result, 'content')).toBe(rawContent)
    })

    it('leaves small host_page_snapshot results unchanged', async () => {
        const rawSnapshot = {
            ok: true,
            result: {
                url: 'https://example.com/form',
                title: 'Small form',
                viewport: {
                    width: 1440,
                    height: 900
                },
                elements: [
                    {
                        ref: 'e1',
                        role: 'textbox',
                        name: 'First name',
                        selector: '#first-name'
                    }
                ]
            }
        }
        const rawContent = JSON.stringify(rawSnapshot)
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'snapshot-call-1',
                    content: rawSnapshot,
                    status: 'success'
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'snapshot-call-1',
                    name: 'host_page_snapshot',
                    args: {
                        mode: 'rich',
                        maxElements: 50
                    }
                },
                tool: getTool(middleware, 'host_page_snapshot'),
                state: {
                    messages: []
                },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_snapshot',
                    tool_call_id: 'snapshot-call-1'
                })
        )

        expect(readStringField(result, 'content')).toBe(rawContent)

        const successPayload = mockDispatchCustomEvent.mock.calls[1]?.[1]
        expect(readStringField(successPayload, 'output')).toBe(rawContent)
    })

    it('compacts large host_page_snapshot artifacts before emitting display output', async () => {
        const largeArtifact = {
            ok: true,
            result: {
                url: 'https://example.com/form',
                title: 'Large artifact form',
                elements: Array.from({ length: 70 }, (_, index) => ({
                    ref: `e${index}`,
                    role: 'textbox',
                    name: `Field ${index}`,
                    hitStack: Array.from({ length: 10 }, (__, stackIndex) => ({
                        selector: `.stack-${index}-${stackIndex}`,
                        text: 'artifact '.repeat(120)
                    }))
                }))
            }
        }
        const rawSnapshot = {
            ok: true,
            result: {
                url: 'https://example.com/form',
                title: 'Small content',
                elements: [
                    {
                        ref: 'e1',
                        role: 'textbox',
                        name: 'First name'
                    }
                ]
            }
        }
        mockInterrupt.mockResolvedValue({
            toolMessages: [
                {
                    tool_call_id: 'snapshot-call-1',
                    content: rawSnapshot,
                    status: 'success',
                    artifact: largeArtifact
                }
            ]
        })
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const wrapToolCall = getWrapToolCall(middleware)

        const result = await wrapToolCall(
            {
                toolCall: {
                    type: 'tool_call',
                    id: 'snapshot-call-1',
                    name: 'host_page_snapshot',
                    args: {
                        mode: 'rich',
                        maxElements: 50
                    }
                },
                tool: getTool(middleware, 'host_page_snapshot'),
                state: {
                    messages: []
                },
                runtime: {}
            },
            async () =>
                new ToolMessage({
                    content: 'unused',
                    name: 'host_page_snapshot',
                    tool_call_id: 'snapshot-call-1'
                })
        )

        const compactedArtifact = readObjectField(result, 'artifact')
        const compactedArtifactText = JSON.stringify(compactedArtifact)
        expect(compactedArtifactText.length).toBeLessThan(JSON.stringify(largeArtifact).length)
        expect(compactedArtifactText.length).toBeLessThanOrEqual(24_000)
        expect(compactedArtifactText).toContain('_xpertCompaction')
        expect(compactedArtifactText).not.toContain('artifact artifact artifact artifact')

        const successPayload = mockDispatchCustomEvent.mock.calls[1]?.[1]
        const emittedArtifact = readObjectField(successPayload, 'artifact')
        expect(JSON.stringify(emittedArtifact)).toBe(compactedArtifactText)
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
                    message: {
                        en_US: 'Wait for the page',
                        zh_Hans: '等待页面'
                    },
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
                    message: {
                        en_US: 'Wait for the page',
                        zh_Hans: '等待页面'
                    },
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

    it('injects host_page_screenshot results as image content for the next model call', async () => {
        const screenshotData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))
        const toolMessage = new ToolMessage({
            content: JSON.stringify({
                ok: true,
                result: {
                    mimeType: 'image/png',
                    data: screenshotData,
                    viewport: {
                        width: 1440,
                        height: 900
                    },
                    imageSize: {
                        width: 720,
                        height: 450
                    },
                    coordinateSpace: 'viewport-css-px'
                }
            }),
            name: 'host_page_screenshot',
            tool_call_id: 'screenshot-call-1',
            status: 'success'
        })

        await middleware.wrapModelCall?.(
            {
                model: {} as any,
                messages: [
                    new AIMessage({
                        content: '',
                        tool_calls: [
                            {
                                id: 'screenshot-call-1',
                                name: 'host_page_screenshot',
                                args: {}
                            }
                        ]
                    }),
                    toolMessage
                ],
                tools: [],
                state: {},
                runtime: {}
            } as any,
            handler
        )

        const forwardedRequest = handler.mock.calls[0][0]
        expect(forwardedRequest.messages).toHaveLength(3)
        expect(forwardedRequest.messages[1]).toBeInstanceOf(ToolMessage)
        expect(forwardedRequest.messages[1].content).toContain('Captured host page screenshot')
        expect(forwardedRequest.messages[1].content).toContain('image 720x450')
        expect(forwardedRequest.messages[1].content).toContain('viewport 1440x900')
        expect(forwardedRequest.messages[1].content).not.toContain(screenshotData)
        expect(forwardedRequest.messages[2]).toBeInstanceOf(HumanMessage)
        expect(forwardedRequest.messages[2].content).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'text',
                    text: expect.stringContaining('cssX = imageX / imageWidth * viewportWidth')
                }),
                expect.objectContaining({
                    type: 'image_url',
                    image_url: expect.objectContaining({
                        url: `data:image/png;base64,${screenshotData}`,
                        detail: 'high'
                    })
                })
            ])
        )
    })

    it('injects host_page_screenshot artifacts without requiring base64 in tool content', async () => {
        const screenshotData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
        const strategy = new BrowserAutomationMiddleware()
        const middleware = await strategy.createMiddleware({}, createContext())
        const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))
        const toolMessage = new ToolMessage({
            content: JSON.stringify({
                ok: true,
                result: {
                    mimeType: 'image/png',
                    dataLength: screenshotData.length
                }
            }),
            name: 'host_page_screenshot',
            tool_call_id: 'screenshot-call-1',
            status: 'success',
            artifact: {
                type: 'host_page_screenshot',
                mimeType: 'image/png',
                data: screenshotData,
                viewport: {
                    width: 1440,
                    height: 900
                },
                imageSize: {
                    width: 720,
                    height: 450
                },
                coordinateSpace: 'viewport-css-px'
            }
        })

        await middleware.wrapModelCall?.(
            {
                model: {} as any,
                messages: [
                    new AIMessage({
                        content: '',
                        tool_calls: [
                            {
                                id: 'screenshot-call-1',
                                name: 'host_page_screenshot',
                                args: {}
                            }
                        ]
                    }),
                    toolMessage
                ],
                tools: [],
                state: {},
                runtime: {}
            } as any,
            handler
        )

        const forwardedRequest = handler.mock.calls[0][0]
        expect(forwardedRequest.messages[2]).toBeInstanceOf(HumanMessage)
        expect(forwardedRequest.messages[2].content).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'text',
                    text: expect.stringContaining('host_page_pointer')
                }),
                expect.objectContaining({
                    type: 'image_url',
                    image_url: expect.objectContaining({
                        url: `data:image/png;base64,${screenshotData}`
                    })
                })
            ])
        )
    })
})
