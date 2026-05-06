import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { InferInteropZodInput, interopParse } from '@langchain/core/utils/types'
import { Injectable } from '@nestjs/common'
import {
    ChatMessageEventTypeEnum,
    ChatMessageStepCategory,
    TAgentMiddlewareMeta,
    getToolCallIdFromConfig
} from '@xpert-ai/contracts'
import { AgentMiddleware, AgentMiddlewareStrategy, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { ClientToolMiddleware, ClientToolMiddlewareConfig } from './client-tool.middleware'

export const BROWSER_AUTOMATION_MIDDLEWARE_NAME = 'browser-automation'
export const HOST_PAGE_WAIT_TOOL_NAME = 'host_page_wait'
const HOST_PAGE_WAIT_MIN_SECONDS = 3
const HOST_PAGE_WAIT_MAX_SECONDS = 60

const HOST_PAGE_AUTOMATION_TOOL_NAMES = [
    'host_page_snapshot',
    'host_page_click',
    'host_page_fill',
    'host_page_press',
    'host_page_select',
    'host_page_scroll',
    'host_page_navigate'
] as const

const configSchema = z.object({
    allowNavigation: z.boolean().default(true)
})

export type BrowserAutomationMiddlewareConfig = InferInteropZodInput<typeof configSchema>

type ClientToolDefinition = NonNullable<ClientToolMiddlewareConfig['clientTools']>[number]

const EMPTY_OBJECT_SCHEMA = JSON.stringify({
    type: 'object',
    additionalProperties: false,
    properties: {}
})

const hostPageWaitToolSchema = z.object({
    seconds: z
        .number()
        .min(HOST_PAGE_WAIT_MIN_SECONDS, `Wait duration must be at least ${HOST_PAGE_WAIT_MIN_SECONDS} seconds.`)
        .max(HOST_PAGE_WAIT_MAX_SECONDS, `Wait duration must be at most ${HOST_PAGE_WAIT_MAX_SECONDS} seconds.`)
        .describe(
            `Seconds to wait before returning. Minimum ${HOST_PAGE_WAIT_MIN_SECONDS}, maximum ${HOST_PAGE_WAIT_MAX_SECONDS}.`
        )
})

type HostPageWaitInput = z.infer<typeof hostPageWaitToolSchema>

const TARGET_PROPERTIES = {
    ref: {
        type: 'string',
        description: 'Element ref from the latest host_page_snapshot result.'
    },
    selector: {
        type: 'string',
        description: 'CSS selector fallback when no ref is available.'
    },
    x: {
        type: 'number',
        description: 'Viewport x coordinate fallback.'
    },
    y: {
        type: 'number',
        description: 'Viewport y coordinate fallback.'
    }
}

function stringifySchema(schema: object): string {
    return JSON.stringify(schema)
}

function createTargetSchema(properties: object = {}, required: string[] = []) {
    return stringifySchema({
        type: 'object',
        additionalProperties: false,
        properties: {
            ...TARGET_PROPERTIES,
            ...properties
        },
        required
    })
}

const CLIENT_TOOLS: ClientToolDefinition[] = [
    {
        name: 'host_page_snapshot',
        description:
            'Capture the current host page URL, title, viewport, scroll position, and visible actionable elements. Use element refs from this result for later actions.',
        schema: EMPTY_OBJECT_SCHEMA
    },
    {
        name: 'host_page_click',
        description: 'Click an element on the host page by ref, selector, or viewport coordinates.',
        schema: createTargetSchema()
    },
    {
        name: 'host_page_fill',
        description: 'Fill a text input, textarea, or contenteditable element on the host page.',
        schema: createTargetSchema(
            {
                value: {
                    type: 'string',
                    description: 'Text to fill into the target element.'
                }
            },
            ['value']
        )
    },
    {
        name: 'host_page_press',
        description: 'Press a keyboard key on the host page, optionally focused on a target element.',
        schema: createTargetSchema(
            {
                key: {
                    type: 'string',
                    description: 'Keyboard key value, such as Enter, Escape, Tab, or a single character.'
                }
            },
            ['key']
        )
    },
    {
        name: 'host_page_select',
        description: 'Select one or more values in a select element on the host page.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...TARGET_PROPERTIES,
                value: {
                    type: 'string',
                    description: 'Single option value to select.'
                },
                values: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Multiple option values to select.'
                }
            },
            oneOf: [{ required: ['value'] }, { required: ['values'] }]
        })
    },
    {
        name: 'host_page_scroll',
        description:
            'Scroll the host page or a scrollable target element. Use deltaX/deltaY for relative scroll, or x/y for absolute scroll positions.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...TARGET_PROPERTIES,
                deltaX: {
                    type: 'number',
                    description: 'Relative horizontal scroll delta.'
                },
                deltaY: {
                    type: 'number',
                    description: 'Relative vertical scroll delta.'
                }
            }
        })
    },
    {
        name: 'host_page_navigate',
        description: 'Navigate the host page to an HTTP(S) URL.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                url: {
                    type: 'string',
                    description: 'Destination HTTP(S) URL. Relative URLs resolve against the current page URL.'
                }
            },
            required: ['url']
        })
    }
]

export const BROWSER_AUTOMATION_CLIENT_TOOLS = CLIENT_TOOLS

export const HOST_PAGE_AUTOMATION_CLIENT_TOOL_NAMES = HOST_PAGE_AUTOMATION_TOOL_NAMES
export const BROWSER_AUTOMATION_TOOL_NAMES = [...HOST_PAGE_AUTOMATION_CLIENT_TOOL_NAMES, HOST_PAGE_WAIT_TOOL_NAME] as const

function createClientTools(options?: unknown): ClientToolDefinition[] {
    const allowNavigation = options && typeof options === 'object' ? Reflect.get(options, 'allowNavigation') : undefined
    const config = interopParse(configSchema, {
        ...(typeof allowNavigation === 'boolean' ? { allowNavigation } : {})
    })
    return CLIENT_TOOLS.filter((clientTool) => config.allowNavigation || clientTool.name !== 'host_page_navigate')
}

function wait(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, durationMs)
    })
}

function getToolCallId(config: unknown): string {
    const toolCallId = getToolCallIdFromConfig(config)
    return typeof toolCallId === 'string' && toolCallId.length > 0 ? toolCallId : randomUUID()
}

function formatSeconds(seconds: number): string {
    return Number.isInteger(seconds) ? String(seconds) : String(Number(seconds.toFixed(3)))
}

async function dispatchHostPageWaitToolMessage(
    toolCallId: string,
    input: HostPageWaitInput,
    overrides: {
        status: 'running' | 'success' | 'fail'
        created_date: Date
        end_date?: Date | null
        output?: string
        error?: string
    }
) {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
        id: toolCallId,
        tool_call_id: toolCallId,
        category: 'Tool',
        type: ChatMessageStepCategory.Program,
        toolset: BROWSER_AUTOMATION_MIDDLEWARE_NAME,
        tool: HOST_PAGE_WAIT_TOOL_NAME,
        title: HOST_PAGE_WAIT_TOOL_NAME,
        input,
        ...overrides
    }).catch((error) => {
        console.warn('[BrowserAutomationMiddleware] dispatch wait tool message failed:', error instanceof Error ? error.message : String(error))
    })
}

function createHostPageWaitTool() {
    return tool(
        async (input: HostPageWaitInput, config) => {
            const toolCallId = getToolCallId(config)
            const createdAt = new Date()
            await dispatchHostPageWaitToolMessage(toolCallId, input, {
                status: 'running',
                created_date: createdAt,
                end_date: null
            })

            await wait(input.seconds * 1_000)

            const output = `Waited ${formatSeconds(input.seconds)} seconds.`
            await dispatchHostPageWaitToolMessage(toolCallId, input, {
                status: 'success',
                created_date: createdAt,
                end_date: new Date(),
                output
            })
            return output
        },
        {
            name: HOST_PAGE_WAIT_TOOL_NAME,
            description:
                'Wait for a specified duration on the server side before continuing host page automation. Use this when a host page needs time to render, animate, navigate, or settle after an action.',
            schema: hostPageWaitToolSchema
        }
    )
}

@Injectable()
@AgentMiddlewareStrategy(BROWSER_AUTOMATION_MIDDLEWARE_NAME)
export class BrowserAutomationMiddleware extends ClientToolMiddleware {
    override meta: TAgentMiddlewareMeta = {
        name: BROWSER_AUTOMATION_MIDDLEWARE_NAME,
        label: {
            en_US: 'Browser Automation',
            zh_Hans: '浏览器自动化'
        },
        description: {
            en_US: 'Lets ChatKit clients execute a safe Playwright-style subset against their host page.',
            zh_Hans: '允许 ChatKit 客户端在宿主页面执行安全的 Playwright 风格子集操作。'
        },
        icon: {
            type: 'svg',
            value: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4 5.5C4 4.67157 4.67157 4 5.5 4H18.5C19.3284 4 20 4.67157 20 5.5V14.5C20 15.3284 19.3284 16 18.5 16H5.5C4.67157 16 4 15.3284 4 14.5V5.5Z" stroke="currentColor" stroke-width="1.5"/>
<path d="M9 20H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 16V20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M8 9H12M8 12H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
            color: 'blue'
        },
        configSchema: {
            type: 'object',
            properties: {
                allowNavigation: {
                    type: 'boolean',
                    title: {
                        en_US: 'Allow Navigation',
                        zh_Hans: '允许页面跳转'
                    },
                    description: {
                        en_US: 'Expose host_page_navigate so the agent can navigate the host page to HTTP(S) URLs.',
                        zh_Hans: '暴露 host_page_navigate，使智能体可以将宿主页面跳转到 HTTP(S) URL。'
                    },
                    default: true
                }
            }
        } as TAgentMiddlewareMeta['configSchema']
    }

    override async createMiddleware(
        options: ClientToolMiddlewareConfig | BrowserAutomationMiddlewareConfig,
        context: IAgentMiddlewareContext
    ): Promise<AgentMiddleware> {
        const middleware = await Promise.resolve(
            super.createMiddleware(
                {
                    clientTools: createClientTools(options),
                    displayToolset: BROWSER_AUTOMATION_MIDDLEWARE_NAME,
                    emitToolMessages: true
                },
                context
            )
        )

        return {
            ...middleware,
            name: BROWSER_AUTOMATION_MIDDLEWARE_NAME,
            tools: [...(middleware.tools ?? []), createHostPageWaitTool()]
        }
    }
}
