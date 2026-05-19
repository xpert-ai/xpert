import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { AIMessage, BaseMessage, HumanMessage, ToolMessage, isAIMessage, isToolMessage } from '@langchain/core/messages'
import type { ToolCall } from '@langchain/core/messages/tool'
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
const HOST_PAGE_SNAPSHOT_TOOL_NAME = 'host_page_snapshot'
const HOST_PAGE_SCREENSHOT_TOOL_NAME = 'host_page_screenshot'
const HOST_PAGE_WAIT_MIN_SECONDS = 3
const HOST_PAGE_WAIT_MAX_SECONDS = 60
const HOST_PAGE_SCREENSHOT_ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg'] as const
const HOST_PAGE_SNAPSHOT_DEFAULT_PAGE_SIZE = 30
const HOST_PAGE_SNAPSHOT_MAX_PAGE_SIZE = 100
const HOST_PAGE_SNAPSHOT_MAX_CRITICAL_BUTTONS = 12
const HOST_PAGE_SNAPSHOT_PAGE_SAMPLE_COUNT = 3
const HOST_PAGE_SNAPSHOT_MAX_CONTENT_CHARS = 24_000
const HOST_PAGE_SNAPSHOT_MAX_STRING_CHARS = 240
const HOST_PAGE_SNAPSHOT_PAGE_STRING_CHARS = 120
const HOST_PAGE_SNAPSHOT_MAX_ARRAY_ITEMS = 4

const HOST_PAGE_AUTOMATION_TOOL_NAMES = [
    HOST_PAGE_SNAPSHOT_TOOL_NAME,
    'host_page_click',
    'host_page_fill',
    'host_page_press',
    'host_page_select',
    'host_page_scroll',
    'host_page_navigate',
    'host_page_hover',
    'host_page_focus',
    'host_page_pointer',
    'host_page_screenshot',
    'host_page_wait_for'
] as const

const HOST_PAGE_TOOL_DISPLAY_MESSAGES = {
    host_page_snapshot: {
        en_US: 'Inspect the page',
        zh_Hans: '查看页面'
    },
    host_page_click: {
        en_US: 'Click the page',
        zh_Hans: '点击页面'
    },
    host_page_fill: {
        en_US: 'Fill a field',
        zh_Hans: '填写字段'
    },
    host_page_press: {
        en_US: 'Press a key',
        zh_Hans: '按下按键'
    },
    host_page_select: {
        en_US: 'Select an option',
        zh_Hans: '选择选项'
    },
    host_page_scroll: {
        en_US: 'Scroll the page',
        zh_Hans: '滚动页面'
    },
    host_page_navigate: {
        en_US: 'Navigate the page',
        zh_Hans: '跳转页面'
    },
    host_page_hover: {
        en_US: 'Hover over an element',
        zh_Hans: '悬停到元素'
    },
    host_page_focus: {
        en_US: 'Focus an element',
        zh_Hans: '聚焦元素'
    },
    host_page_pointer: {
        en_US: 'Operate the page by coordinates',
        zh_Hans: '通过坐标操作页面'
    },
    host_page_screenshot: {
        en_US: 'Capture a page screenshot',
        zh_Hans: '截取页面截图'
    },
    host_page_wait_for: {
        en_US: 'Wait for a page state',
        zh_Hans: '等待页面状态'
    },
    [HOST_PAGE_WAIT_TOOL_NAME]: {
        en_US: 'Wait for the page',
        zh_Hans: '等待页面'
    }
} as const

const configSchema = z.object({
    allowNavigation: z.boolean().default(true)
})

export type BrowserAutomationMiddlewareConfig = InferInteropZodInput<typeof configSchema>

type ClientToolDefinition = NonNullable<ClientToolMiddlewareConfig['clientTools']>[number]

type ReadyToolCallSet = {
    toolCalls: NonNullable<AIMessage['tool_calls']>
    toolMessagesById: Map<string, ToolMessage>
}

type HostPageScreenshotMimeType = (typeof HOST_PAGE_SCREENSHOT_ALLOWED_MIME_TYPES)[number]

type HostPageViewportSize = {
    width: number
    height: number
}

type HostPageScrollOffset = {
    x: number
    y: number
}

type JsonObject = {
    [key: string]: unknown
}

type HostPageSnapshotPaginationRequest = {
    page: number
    pageSize: number
    snapshotId?: string
    includeIndex: boolean
    hasPaginationInput: boolean
}

type HostPageSnapshotPaginationOptions = HostPageSnapshotPaginationRequest & {
    snapshotId: string
    warning?: string
}

type IndexedSnapshotElement = {
    index: number
    element: unknown
}

type HostPageScreenshotAttachment = {
    toolCallId: string
    mimeType: HostPageScreenshotMimeType
    dataUrl: string
    dataLength: number
    viewport?: HostPageViewportSize
    imageSize?: HostPageViewportSize
    devicePixelRatio?: number
    scroll?: HostPageScrollOffset
    coordinateSpace?: 'viewport-css-px'
}

const BROWSER_AUTOMATION_USAGE_GUIDANCE =
    'For complex enterprise/SAP/Fiori/iframe pages, avoid looping host_page_snapshot and host_page_click. First inspect one rich snapshot, then fill known form fields with host_page_fill, press F8/Enter or click the Execute/Search button once, and wait with host_page_wait_for or host_page_wait. If one DOM/ref click does not change the page, switch to host_page_screenshot and then host_page_pointer coordinates instead of repeating the same click.'

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
    axRef: {
        type: 'string',
        description: 'Accessibility-tree ref from the latest host_page_snapshot result.'
    },
    selector: {
        type: 'string',
        description: 'CSS selector fallback when no ref is available.'
    },
    role: {
        type: 'string',
        description: 'Accessible role fallback, such as button, link, textbox, checkbox, or combobox.'
    },
    name: {
        type: 'string',
        description: 'Accessible name fallback. Prefer exact user-visible labels from host_page_snapshot.'
    },
    text: {
        type: 'string',
        description: 'Visible text fallback when role/name is not enough.'
    },
    testId: {
        type: 'string',
        description: 'data-testid, data-test-id, or data-qa fallback.'
    },
    x: {
        type: 'number',
        description:
            'Target tab page viewport CSS x coordinate. This is not a macOS screen coordinate and excludes browser chrome or ChatKit sidebars.'
    },
    y: {
        type: 'number',
        description:
            'Target tab page viewport CSS y coordinate. This is not a macOS screen coordinate and excludes browser chrome or ChatKit sidebars.'
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
        description: `Capture a rich host page snapshot including URL, title, viewport, scroll, page state, actionable DOM elements, structured form labels/group labels/select options, nearby visible label text, accessibility summaries, layout hit-test details, and automation capabilities. Use refs, axRefs, role/name, label, groupLabel, options, selectedLabel, nearbyText, or coordinates from this result for later actions. For large snapshots, inspect _xpertPagination, pages, and criticalElements. Use criticalElements first for checkbox, radio, switch, and checked controls. If the needed element is not in elements or criticalElements, choose the likely page from pages and call host_page_snapshot again with snapshotId, page, pageSize, and includeIndex=false. ${BROWSER_AUTOMATION_USAGE_GUIDANCE}`,
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                mode: {
                    type: 'string',
                    enum: ['fast', 'rich', 'vision'],
                    description:
                        'Snapshot detail level. Use rich by default; use vision only when a screenshot is needed.'
                },
                maxElements: {
                    type: 'number',
                    minimum: 1,
                    maximum: 300,
                    description: 'Maximum actionable elements to return.'
                },
                page: {
                    type: 'number',
                    minimum: 1,
                    description: '1-based snapshot element page to return.'
                },
                pageSize: {
                    type: 'number',
                    minimum: 1,
                    maximum: HOST_PAGE_SNAPSHOT_MAX_PAGE_SIZE,
                    description: `Elements per snapshot page. Defaults to ${HOST_PAGE_SNAPSHOT_DEFAULT_PAGE_SIZE}.`
                },
                snapshotId: {
                    type: 'string',
                    description: 'Snapshot id from a previous host_page_snapshot response when requesting another page.'
                },
                includeIndex: {
                    type: 'boolean',
                    description:
                        'Include pagination summaries and critical element index. Defaults to true for initial snapshots and false for page requests.'
                },
                includeScreenshot: {
                    type: 'boolean',
                    description: 'Include visual screenshot data when the client supports screenshots.'
                },
                includeNetwork: {
                    type: 'boolean',
                    description: 'Include recent network/lifecycle state when available.'
                },
                includeConsole: {
                    type: 'boolean',
                    description: 'Include recent console/runtime errors when available.'
                }
            }
        })
    },
    {
        name: 'host_page_click',
        description: `Click the host page using Playwright-style targeting. Prefer ref or axRef from host_page_snapshot, then role/name, nearbyText-derived target choice, testId, selector, or coordinates. The browser extension uses real CDP mouse input when available. Do not repeatedly click the same target if the next snapshot does not change; use fill, press, wait_for, pointer, or screenshot instead. ${BROWSER_AUTOMATION_USAGE_GUIDANCE}`,
        schema: createTargetSchema(
            {
                strategy: {
                    type: 'string',
                    enum: ['auto', 'dom', 'cdp_mouse', 'deepest_point', 'ancestor_actionable', 'label_control'],
                    description: 'Click strategy. Use auto unless a specific fallback is needed.'
                },
                button: {
                    type: 'string',
                    enum: ['left', 'middle', 'right'],
                    description: 'Mouse button to click.'
                },
                clickCount: {
                    type: 'number',
                    minimum: 1,
                    maximum: 3,
                    description: 'Number of clicks.'
                },
                message: {
                    type: 'string',
                    description:
                        'Concise natural-language description of the intended click target, shown as the ChatKit tool-call row label. For example: "Click the top Execute toolbar button".'
                }
            },
            ['message']
        )
    },
    {
        name: 'host_page_fill',
        description:
            'Fill a text input, textarea, or contenteditable element on the host page. Prefer this over clicking when the task is to enter filter/query values in forms, including SAP/Fiori selection screens.',
        schema: createTargetSchema(
            {
                value: {
                    type: 'string',
                    description: 'Text to fill into the target element.'
                },
                message: {
                    type: 'string',
                    description:
                        'Concise natural-language description of the intended fill target and value, shown as the ChatKit tool-call row label. For example: "Fill the Material field with 100000".'
                }
            },
            ['value', 'message']
        )
    },
    {
        name: 'host_page_press',
        description:
            'Press a keyboard key on the host page, optionally focused on a target element. Use Enter to submit SAP/search forms after filling fields when the page supports keyboard execution. The browser extension uses CDP keyboard input when available.',
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
        description:
            'Select one or more values in a select element on the host page. Use a one-item values array for single-select.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...TARGET_PROPERTIES,
                values: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Option value(s) to select. Use a one-item array for single-select.'
                }
            },
            required: ['values']
        })
    },
    {
        name: 'host_page_scroll',
        description:
            'Scroll the host page or a scrollable target element. Use deltaX/deltaY for relative scroll, or x/y for absolute scroll positions. The browser extension uses CDP mouse wheel for page-level relative scroll when available.',
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
    },
    {
        name: 'host_page_hover',
        description:
            'Move the pointer over a host page target by ref, axRef, semantic target, selector, or coordinates.',
        schema: createTargetSchema()
    },
    {
        name: 'host_page_focus',
        description: 'Focus a host page target by ref, axRef, semantic target, selector, or coordinates.',
        schema: createTargetSchema()
    },
    {
        name: 'host_page_pointer',
        description:
            'Dispatch low-level pointer movement or button actions against the host page using viewport CSS coordinates. Use this after host_page_screenshot for SAP/Fiori/iframe pages when DOM/ref click did not change the page. Coordinates are relative to the captured page viewport, not the OS screen.',
        schema: createTargetSchema(
            {
                action: {
                    type: 'string',
                    enum: ['move', 'down', 'up', 'click'],
                    description: 'Pointer action to perform.'
                },
                toX: {
                    type: 'number',
                    description: 'Destination viewport x coordinate for future drag-style clients.'
                },
                toY: {
                    type: 'number',
                    description: 'Destination viewport y coordinate for future drag-style clients.'
                },
                button: {
                    type: 'string',
                    enum: ['left', 'middle', 'right'],
                    description: 'Mouse button to use.'
                },
                clickCount: {
                    type: 'number',
                    minimum: 1,
                    maximum: 3,
                    description: 'Number of clicks for action=click.'
                },
                message: {
                    type: 'string',
                    description:
                        'Concise natural-language description of the intended visual target, shown as the ChatKit tool-call row label. For example: "Click the bottom Execute button".'
                }
            },
            ['message']
        )
    },
    {
        name: 'host_page_screenshot',
        description:
            'Capture a screenshot of the current host page when the browser client supports screenshots. Use when DOM/accessibility snapshot is insufficient, fields have weak labels, the page is inside SAP/Fiori/iframe UI, or one DOM/ref click did not change the page. The screenshot is attached as image content in the next model step; use its coordinate metadata to call host_page_pointer.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                format: {
                    type: 'string',
                    enum: ['jpeg', 'png'],
                    description: 'Screenshot image format.'
                },
                quality: {
                    type: 'number',
                    minimum: 1,
                    maximum: 100,
                    description: 'JPEG quality from 1 to 100.'
                }
            }
        })
    },
    {
        name: 'host_page_wait_for',
        description:
            'Wait on the client until a host page target becomes attached, visible, hidden, or detached. Use after navigation, animation, or SPA updates.',
        schema: createTargetSchema({
            state: {
                type: 'string',
                enum: ['attached', 'visible', 'hidden', 'detached'],
                description: 'Target state to wait for.'
            },
            timeoutSeconds: {
                type: 'number',
                minimum: 0,
                maximum: 60,
                description: 'Maximum client-side wait duration in seconds.'
            }
        })
    }
]

export const BROWSER_AUTOMATION_CLIENT_TOOLS = CLIENT_TOOLS

export const HOST_PAGE_AUTOMATION_CLIENT_TOOL_NAMES = HOST_PAGE_AUTOMATION_TOOL_NAMES
export const BROWSER_AUTOMATION_TOOL_NAMES = [
    ...HOST_PAGE_AUTOMATION_CLIENT_TOOL_NAMES,
    HOST_PAGE_WAIT_TOOL_NAME
] as const

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

function findReadyToolCallSet(messages: BaseMessage[]): ReadyToolCallSet | null {
    if (!messages.length) {
        return null
    }

    const trailingToolMessages: ToolMessage[] = []

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (!message || !isToolMessage(message)) {
            if (trailingToolMessages.length === 0 || !isAIMessage(message)) {
                return null
            }

            const aiMessage = message as AIMessage
            const toolCalls = aiMessage.tool_calls ?? []
            if (toolCalls.length === 0) {
                return null
            }

            const expectedToolCallIds = new Set(toolCalls.map((toolCall) => toolCall.id).filter(Boolean))
            const toolMessagesById = trailingToolMessages.reduce<Map<string, ToolMessage>>((map, toolMessage) => {
                if (
                    toolMessage.tool_call_id &&
                    expectedToolCallIds.has(toolMessage.tool_call_id) &&
                    !map.has(toolMessage.tool_call_id)
                ) {
                    map.set(toolMessage.tool_call_id, toolMessage)
                }
                return map
            }, new Map())

            if (
                toolMessagesById.size !== expectedToolCallIds.size ||
                trailingToolMessages.some((toolMessage) => !expectedToolCallIds.has(toolMessage.tool_call_id))
            ) {
                return null
            }

            return {
                toolCalls,
                toolMessagesById
            }
        }

        trailingToolMessages.unshift(message as ToolMessage)
    }

    return null
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function parseToolMessageContent(content: ToolMessage['content']): unknown {
    if (typeof content !== 'string') {
        return null
    }

    try {
        return JSON.parse(content)
    } catch {
        return null
    }
}

function readScreenshotMimeType(value: unknown): HostPageScreenshotMimeType | null {
    return typeof value === 'string' && (HOST_PAGE_SCREENSHOT_ALLOWED_MIME_TYPES as readonly string[]).includes(value)
        ? (value as HostPageScreenshotMimeType)
        : null
}

function readFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoundedInteger(value: unknown, min: number, max: number): number | null {
    const numberValue = readFiniteNumber(value)
    if (numberValue == null) {
        return null
    }

    const integer = Math.floor(numberValue)
    if (integer < min) {
        return min
    }

    if (integer > max) {
        return max
    }

    return integer
}

function readNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readStringProperty(record: Record<string, unknown>, key: string): string | undefined {
    return readNonEmptyString(record[key])
}

function readLowerStringProperty(record: Record<string, unknown>, key: string): string | undefined {
    return readStringProperty(record, key)?.toLowerCase()
}

function readBooleanProperty(record: Record<string, unknown>, key: string): boolean | undefined {
    const value = record[key]
    return typeof value === 'boolean' ? value : undefined
}

function readSnapshotPaginationRequest(args: unknown): HostPageSnapshotPaginationRequest {
    const record = readRecord(args)
    const page = readBoundedInteger(record?.page, 1, Number.MAX_SAFE_INTEGER)
    const pageSize =
        readBoundedInteger(record?.pageSize, 1, HOST_PAGE_SNAPSHOT_MAX_PAGE_SIZE) ??
        HOST_PAGE_SNAPSHOT_DEFAULT_PAGE_SIZE
    const snapshotId = readNonEmptyString(record?.snapshotId)
    const includeIndexValue = record ? record.includeIndex : undefined
    const hasPaginationInput =
        !!record && ['page', 'pageSize', 'snapshotId', 'includeIndex'].some((key) => key in record)
    const isPageRequest = page != null || snapshotId != null
    const includeIndex = typeof includeIndexValue === 'boolean' ? includeIndexValue : !isPageRequest

    return {
        page: page ?? 1,
        pageSize,
        ...(snapshotId ? { snapshotId } : {}),
        includeIndex,
        hasPaginationInput
    }
}

function readExistingSnapshotPagination(result: Record<string, unknown>) {
    const pagination = readRecord(result._xpertPagination)
    if (!pagination) {
        return {}
    }

    return {
        snapshotId: readNonEmptyString(pagination.snapshotId),
        warning: readNonEmptyString(pagination.warning)
    }
}

function hasSnapshotPagination(result: Record<string, unknown>): boolean {
    const pagination = readRecord(result._xpertPagination)
    return (
        !!pagination &&
        readNonEmptyString(pagination.snapshotId) != null &&
        readFiniteNumber(pagination.page) != null &&
        readFiniteNumber(pagination.pageSize) != null &&
        readFiniteNumber(pagination.pageCount) != null &&
        readFiniteNumber(pagination.totalElements) != null
    )
}

function resolveSnapshotPaginationOptions(
    result: Record<string, unknown>,
    request: HostPageSnapshotPaginationRequest
): HostPageSnapshotPaginationOptions {
    const existing = readExistingSnapshotPagination(result)
    const snapshotId = request.snapshotId ?? existing.snapshotId ?? randomUUID()
    const warning =
        request.snapshotId && existing.snapshotId && request.snapshotId !== existing.snapshotId
            ? 'Requested snapshotId was not returned by the client; using refreshed snapshot data.'
            : existing.warning

    return {
        ...request,
        snapshotId,
        ...(warning ? { warning } : {})
    }
}

function truncateText(value: string, maxChars = HOST_PAGE_SNAPSHOT_MAX_STRING_CHARS): string {
    return value.length > maxChars
        ? `${value.slice(0, maxChars)}... [truncated ${value.length - maxChars} chars]`
        : value
}

function compactSnapshotValue(
    value: unknown,
    depth = 0,
    maxStringChars = HOST_PAGE_SNAPSHOT_MAX_STRING_CHARS
): unknown {
    if (typeof value === 'string') {
        return truncateText(value, maxStringChars)
    }

    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
        return value
    }

    if (Array.isArray(value)) {
        const maxItems = depth === 0 ? HOST_PAGE_SNAPSHOT_MAX_ARRAY_ITEMS : 2
        const items = value.slice(0, maxItems).map((item) => compactSnapshotValue(item, depth + 1, maxStringChars))
        if (value.length > maxItems) {
            items.push(`[truncated ${value.length - maxItems} items]`)
        }
        return items
    }

    const record = readRecord(value)
    if (!record) {
        return String(value)
    }

    const compacted: JsonObject = {}
    const entries = Object.entries(record)
    for (const [key, entry] of entries.slice(0, 12)) {
        compacted[key] = compactSnapshotValue(entry, depth + 1, maxStringChars)
    }
    if (entries.length > 12) {
        compacted._truncatedKeys = entries.length - 12
    }
    return compacted
}

const HOST_PAGE_SNAPSHOT_RESULT_KEYS = [
    'url',
    'title',
    'viewport',
    'scroll',
    'pageState',
    'capabilities',
    'networkState',
    'console',
    'errors'
] as const

const HOST_PAGE_SNAPSHOT_ELEMENT_KEYS = [
    'ref',
    'axRef',
    'role',
    'name',
    'label',
    'groupLabel',
    'tag',
    'type',
    'text',
    'selector',
    'value',
    'options',
    'selectedLabel',
    'placeholder',
    'enabled',
    'visible',
    'actionable',
    'checked',
    'rect',
    'center',
    'nearbyText'
] as const

function compactSnapshotElement(element: unknown, maxStringChars = HOST_PAGE_SNAPSHOT_MAX_STRING_CHARS): unknown {
    const record = readRecord(element)
    if (!record) {
        return compactSnapshotValue(element, 1, maxStringChars)
    }

    const compacted: JsonObject = {}
    for (const key of HOST_PAGE_SNAPSHOT_ELEMENT_KEYS) {
        if (key in record) {
            compacted[key] = compactSnapshotValue(record[key], 1, maxStringChars)
        }
    }
    return compacted
}

function buildSnapshotElementIndexEntry(element: unknown, index: number): JsonObject {
    const compacted = compactSnapshotElement(element, HOST_PAGE_SNAPSHOT_PAGE_STRING_CHARS)
    const record = readRecord(compacted)
    return record ? { index, ...record } : { index, value: compacted }
}

function buildSnapshotElementSummary(element: unknown, index: number): JsonObject {
    const record = readRecord(element)
    if (!record) {
        return { index }
    }

    const summary: JsonObject = { index }
    for (const key of ['ref', 'role', 'label', 'name', 'text', 'selector'] as const) {
        const value = readStringProperty(record, key)
        if (value) {
            summary[key] = truncateText(value, 80)
        }
    }

    const checked = readBooleanProperty(record, 'checked')
    if (checked != null) {
        summary.checked = checked
    }

    return summary
}

function isStateControlElement(element: unknown): boolean {
    const record = readRecord(element)
    if (!record) {
        return false
    }

    const role = readLowerStringProperty(record, 'role')
    const tag = readLowerStringProperty(record, 'tag')
    const type = readLowerStringProperty(record, 'type')

    return (
        role === 'checkbox' ||
        role === 'radio' ||
        role === 'switch' ||
        typeof record.checked === 'boolean' ||
        (tag === 'input' && (type === 'checkbox' || type === 'radio'))
    )
}

function isActionButtonElement(element: unknown): boolean {
    const record = readRecord(element)
    if (!record) {
        return false
    }

    const role = readLowerStringProperty(record, 'role')
    const tag = readLowerStringProperty(record, 'tag')
    const isButtonLike = role === 'button' || role === 'link' || tag === 'button'

    return (
        isButtonLike &&
        readBooleanProperty(record, 'visible') !== false &&
        readBooleanProperty(record, 'actionable') !== false &&
        readBooleanProperty(record, 'enabled') !== false
    )
}

function selectSpreadItems(items: IndexedSnapshotElement[], maxItems: number): IndexedSnapshotElement[] {
    if (items.length <= maxItems) {
        return items
    }

    if (maxItems <= 1) {
        return items.slice(0, maxItems)
    }

    const selected = new Map<number, IndexedSnapshotElement>()
    for (let index = 0; index < maxItems; index += 1) {
        const itemIndex = Math.round((index * (items.length - 1)) / (maxItems - 1))
        const item = items[itemIndex]
        if (item) {
            selected.set(item.index, item)
        }
    }

    for (const item of items) {
        if (selected.size >= maxItems) {
            break
        }
        selected.set(item.index, item)
    }

    return Array.from(selected.values()).sort((left, right) => left.index - right.index)
}

function buildCriticalElementsIndex(elements: unknown[]): JsonObject[] {
    const indexedElements = elements.map((element, index) => ({ index, element }))
    const stateControls = indexedElements.filter(({ element }) => isStateControlElement(element))
    const stateControlIndexes = new Set(stateControls.map(({ index }) => index))
    const actionButtons = indexedElements.filter(
        ({ element, index }) => !stateControlIndexes.has(index) && isActionButtonElement(element)
    )
    const selectedButtons = selectSpreadItems(actionButtons, HOST_PAGE_SNAPSHOT_MAX_CRITICAL_BUTTONS)
    const selected = new Map<number, IndexedSnapshotElement>()

    for (const item of [...stateControls, ...selectedButtons]) {
        selected.set(item.index, item)
    }

    return Array.from(selected.values())
        .sort((left, right) => left.index - right.index)
        .map(({ element, index }) => buildSnapshotElementIndexEntry(element, index))
}

function buildPageSummaries(elements: unknown[], pageSize: number): JsonObject[] {
    const pageCount = Math.ceil(elements.length / pageSize)
    return Array.from({ length: pageCount }, (_, pageIndex) => {
        const startIndex = pageIndex * pageSize
        const pageElements = elements.slice(startIndex, startIndex + pageSize)
        const roles: JsonObject = {}

        for (const element of pageElements) {
            const record = readRecord(element)
            const role = record ? readStringProperty(record, 'role') : undefined
            if (role) {
                const roleCount = roles[role]
                roles[role] = (typeof roleCount === 'number' ? roleCount : 0) + 1
            }
        }

        return {
            page: pageIndex + 1,
            startIndex,
            endIndex: startIndex + pageElements.length - 1,
            elementCount: pageElements.length,
            roles,
            samples: pageElements
                .slice(0, HOST_PAGE_SNAPSHOT_PAGE_SAMPLE_COUNT)
                .map((element, elementIndex) => buildSnapshotElementSummary(element, startIndex + elementIndex))
        }
    })
}

function buildCompactedSnapshotPayload(
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
    originalContentLength: number,
    options: HostPageSnapshotPaginationOptions,
    returnedElementCount?: number
): JsonObject {
    const elements = Array.isArray(result.elements) ? result.elements : []
    const compactedResult: JsonObject = {}

    for (const key of HOST_PAGE_SNAPSHOT_RESULT_KEYS) {
        if (key in result) {
            compactedResult[key] = compactSnapshotValue(result[key])
        }
    }

    const pageCount = elements.length > 0 ? Math.ceil(elements.length / options.pageSize) : 0
    const page = pageCount > 0 ? Math.min(options.page, pageCount) : 1
    const startIndex = pageCount > 0 ? (page - 1) * options.pageSize : 0
    const pageElements = elements.slice(startIndex, startIndex + (returnedElementCount ?? options.pageSize))

    compactedResult.elements = pageElements.map((element) =>
        compactSnapshotElement(element, HOST_PAGE_SNAPSHOT_PAGE_STRING_CHARS)
    )
    if (options.includeIndex) {
        compactedResult.pages = buildPageSummaries(elements, options.pageSize)
        compactedResult.criticalElements = buildCriticalElementsIndex(elements)
    }
    compactedResult._xpertPagination = {
        snapshotId: options.snapshotId,
        page,
        pageSize: options.pageSize,
        pageCount,
        totalElements: elements.length,
        indexIncluded: options.includeIndex,
        ...(options.warning ? { warning: options.warning } : {})
    }
    compactedResult._xpertCompaction = {
        compacted: true,
        reason: 'host_page_snapshot output compacted before model continuation and message persistence',
        originalContentLength,
        originalElementCount: elements.length,
        keptElementCount: pageElements.length
    }

    const compactedPayload: JsonObject = {
        ok: typeof payload.ok === 'boolean' ? payload.ok : true,
        result: compactedResult
    }

    if (typeof payload.error === 'string') {
        compactedPayload.error = truncateText(payload.error)
    }

    return compactedPayload
}

function getSerializedLength(value: unknown): number {
    if (value == null) {
        return 0
    }

    if (typeof value === 'string') {
        return value.length
    }

    try {
        const serialized = JSON.stringify(value)
        return typeof serialized === 'string' ? serialized.length : 0
    } catch {
        return String(value).length
    }
}

function getSnapshotElementCount(result: Record<string, unknown>): number {
    return Array.isArray(result.elements) ? result.elements.length : 0
}

function shouldCompactSnapshot(
    result: Record<string, unknown>,
    serializedLength: number,
    request: HostPageSnapshotPaginationRequest
): boolean {
    if (hasSnapshotPagination(result) && serializedLength <= HOST_PAGE_SNAPSHOT_MAX_CONTENT_CHARS) {
        return false
    }

    return (
        request.hasPaginationInput ||
        serializedLength > HOST_PAGE_SNAPSHOT_MAX_CONTENT_CHARS ||
        getSnapshotElementCount(result) > request.pageSize
    )
}

function stringifyCompactedSnapshotPayload(
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
    originalContentLength: number,
    request: HostPageSnapshotPaginationRequest
): string {
    const elements = Array.isArray(result.elements) ? result.elements : []
    const options = resolveSnapshotPaginationOptions(result, request)
    const pageCount = elements.length > 0 ? Math.ceil(elements.length / options.pageSize) : 0
    const page = pageCount > 0 ? Math.min(options.page, pageCount) : 1
    const startIndex = pageCount > 0 ? (page - 1) * options.pageSize : 0
    const availablePageElementCount = Math.max(0, Math.min(options.pageSize, elements.length - startIndex))
    let keptElementCount = availablePageElementCount

    while (keptElementCount >= 0) {
        const compacted = JSON.stringify(
            buildCompactedSnapshotPayload(payload, result, originalContentLength, options, keptElementCount)
        )
        if (compacted.length <= HOST_PAGE_SNAPSHOT_MAX_CONTENT_CHARS || keptElementCount === 0) {
            return compacted
        }
        keptElementCount = Math.floor(keptElementCount / 2)
    }

    return JSON.stringify(buildCompactedSnapshotPayload(payload, result, originalContentLength, options, 0))
}

function parseCompactedSnapshotPayload(
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
    originalContentLength: number,
    request: HostPageSnapshotPaginationRequest
): JsonObject {
    try {
        const compacted = JSON.parse(stringifyCompactedSnapshotPayload(payload, result, originalContentLength, request))
        const record = readRecord(compacted)
        return (
            record ??
            buildCompactedSnapshotPayload(
                payload,
                result,
                originalContentLength,
                resolveSnapshotPaginationOptions(result, request),
                0
            )
        )
    } catch {
        return buildCompactedSnapshotPayload(
            payload,
            result,
            originalContentLength,
            resolveSnapshotPaginationOptions(result, request),
            0
        )
    }
}

function readSnapshotPayload(
    value: unknown
): { payload: Record<string, unknown>; result: Record<string, unknown> } | null {
    const parsed = typeof value === 'string' ? parseToolMessageContent(value) : value
    const payload = readRecord(parsed)
    const result = payload ? readRecord(payload.result) : null
    return payload && result ? { payload, result } : null
}

function compactHostPageSnapshotArtifact(
    artifact: unknown,
    artifactLength: number,
    request: HostPageSnapshotPaginationRequest
): unknown {
    const snapshot = readSnapshotPayload(artifact)
    if (!snapshot) {
        return {
            type: HOST_PAGE_SNAPSHOT_TOOL_NAME,
            _xpertCompaction: {
                compacted: true,
                reason: 'host_page_snapshot artifact replaced before model continuation and message persistence',
                originalArtifactLength: artifactLength
            }
        }
    }

    return parseCompactedSnapshotPayload(snapshot.payload, snapshot.result, artifactLength, request)
}

function compactHostPageSnapshotToolMessage(message: ToolMessage, toolCall?: ToolCall): ToolMessage {
    if (typeof message.content !== 'string') {
        return message
    }

    const snapshot = readSnapshotPayload(message.content)
    if (!snapshot) {
        return message
    }

    const artifactLength = getSerializedLength(message.artifact)
    const artifactSnapshot = message.artifact ? readSnapshotPayload(message.artifact) : null
    const paginationRequest = readSnapshotPaginationRequest(toolCall?.args)
    const shouldCompactContent = shouldCompactSnapshot(snapshot.result, message.content.length, paginationRequest)
    const shouldCompactArtifact =
        artifactLength > HOST_PAGE_SNAPSHOT_MAX_CONTENT_CHARS ||
        (artifactSnapshot ? shouldCompactSnapshot(artifactSnapshot.result, artifactLength, paginationRequest) : false)

    if (!shouldCompactContent && !shouldCompactArtifact) {
        return message
    }

    const content = shouldCompactContent
        ? stringifyCompactedSnapshotPayload(
              snapshot.payload,
              snapshot.result,
              message.content.length,
              paginationRequest
          )
        : message.content
    const artifact = shouldCompactArtifact
        ? compactHostPageSnapshotArtifact(message.artifact, artifactLength, paginationRequest)
        : message.artifact

    return new ToolMessage({
        content,
        name: message.name ?? HOST_PAGE_SNAPSHOT_TOOL_NAME,
        tool_call_id: message.tool_call_id,
        status: message.status,
        artifact,
        metadata: message.metadata,
        additional_kwargs: message.additional_kwargs,
        response_metadata: message.response_metadata,
        id: message.id
    })
}

function compactBrowserAutomationToolMessage(message: ToolMessage, toolCall: ToolCall): ToolMessage {
    if (toolCall.name === HOST_PAGE_SNAPSHOT_TOOL_NAME || message.name === HOST_PAGE_SNAPSHOT_TOOL_NAME) {
        return compactHostPageSnapshotToolMessage(message, toolCall)
    }

    return message
}

function readViewportSize(value: unknown): HostPageViewportSize | undefined {
    const record = readRecord(value)
    if (!record) {
        return undefined
    }

    const width = readFiniteNumber(record.width)
    const height = readFiniteNumber(record.height)
    return width !== null && height !== null ? { width, height } : undefined
}

function readScrollOffset(value: unknown): HostPageScrollOffset | undefined {
    const record = readRecord(value)
    if (!record) {
        return undefined
    }

    const x = readFiniteNumber(record.x)
    const y = readFiniteNumber(record.y)
    return x !== null && y !== null ? { x, y } : undefined
}

function readScreenshotPayload(value: unknown): Omit<HostPageScreenshotAttachment, 'toolCallId'> | null {
    const record = readRecord(value)
    if (!record || record.ok === false) {
        return null
    }

    const payload = readRecord(record.result) ?? record
    const mimeType = readScreenshotMimeType(payload.mimeType)
    const rawData = typeof payload.data === 'string' ? payload.data.trim() : ''
    if (!mimeType || !rawData) {
        return null
    }

    const dataUrl = rawData.startsWith('data:') ? rawData : `data:${mimeType};base64,${rawData}`

    return {
        mimeType,
        dataUrl,
        dataLength: rawData.length,
        viewport: readViewportSize(payload.viewport),
        imageSize: readViewportSize(payload.imageSize),
        devicePixelRatio: readFiniteNumber(payload.devicePixelRatio) ?? undefined,
        scroll: readScrollOffset(payload.scroll),
        coordinateSpace: payload.coordinateSpace === 'viewport-css-px' ? 'viewport-css-px' : undefined
    }
}

function getScreenshotAttachment(toolCallId: string, toolMessage: ToolMessage): HostPageScreenshotAttachment | null {
    const artifactPayload = readScreenshotPayload(toolMessage.artifact)
    const contentPayload = artifactPayload ?? readScreenshotPayload(parseToolMessageContent(toolMessage.content))
    if (!contentPayload) {
        return null
    }

    return {
        toolCallId,
        ...contentPayload
    }
}

function formatSize(size: HostPageViewportSize | undefined): string {
    return size ? `${size.width}x${size.height}` : 'unknown'
}

function buildScreenshotToolMessageContent(attachment: HostPageScreenshotAttachment): string {
    return `Captured host page screenshot (${attachment.mimeType}, image ${formatSize(attachment.imageSize)}, viewport ${formatSize(attachment.viewport)}, ${attachment.dataLength} base64 characters). The screenshot is attached as image content in the next model step.`
}

function buildScreenshotAttachmentText(attachments: HostPageScreenshotAttachment[]): string {
    const ids = attachments.map((attachment) => attachment.toolCallId).join(', ')
    const coordinateHints = attachments
        .filter((attachment) => attachment.viewport && attachment.imageSize)
        .map(
            (attachment) =>
                `${attachment.toolCallId}: image ${formatSize(attachment.imageSize)}, viewport ${formatSize(attachment.viewport)}`
        )
        .join('; ')
    const mapping =
        coordinateHints.length > 0
            ? ` Coordinate mapping for host_page_pointer: cssX = imageX / imageWidth * viewportWidth, cssY = imageY / imageHeight * viewportHeight. Metadata: ${coordinateHints}.`
            : ' Use viewport CSS pixel coordinates for host_page_pointer; these coordinates are relative to the page viewport, not the OS screen or browser chrome.'
    return `The host page screenshot result from \`${HOST_PAGE_SCREENSHOT_TOOL_NAME}\` is attached below as image content. Use the visual content to continue browser automation. For SAP/Fiori/iframe pages, if one DOM/ref click did not change the page, choose the visual target in this screenshot and call host_page_pointer once with the converted viewport coordinates.${mapping} Tool call id(s): ${ids}.`
}

function compactScreenshotToolMessage(message: ToolMessage, attachment: HostPageScreenshotAttachment): ToolMessage {
    return new ToolMessage({
        content: buildScreenshotToolMessageContent(attachment),
        name: message.name ?? HOST_PAGE_SCREENSHOT_TOOL_NAME,
        tool_call_id: message.tool_call_id,
        status: message.status,
        artifact: message.artifact,
        metadata: message.metadata,
        additional_kwargs: message.additional_kwargs,
        response_metadata: message.response_metadata,
        id: message.id
    })
}

function prepareHostPageScreenshotModelRequest<TRequest extends { messages: BaseMessage[] }>(
    request: TRequest
): TRequest {
    const readyToolCallSet = findReadyToolCallSet(request.messages)
    if (!readyToolCallSet) {
        return request
    }

    const attachments = readyToolCallSet.toolCalls
        .filter((toolCall) => toolCall.name === HOST_PAGE_SCREENSHOT_TOOL_NAME && !!toolCall.id)
        .map((toolCall) => {
            const toolCallId = toolCall.id as string
            const toolMessage = readyToolCallSet.toolMessagesById.get(toolCallId)
            return toolMessage ? getScreenshotAttachment(toolCallId, toolMessage) : null
        })
        .filter((attachment): attachment is HostPageScreenshotAttachment => Boolean(attachment))

    if (attachments.length === 0) {
        return request
    }

    const attachmentsByToolCallId = attachments.reduce<Map<string, HostPageScreenshotAttachment>>((map, attachment) => {
        map.set(attachment.toolCallId, attachment)
        return map
    }, new Map())
    const messages = request.messages.map((message) => {
        if (!isToolMessage(message)) {
            return message
        }

        const attachment = attachmentsByToolCallId.get(message.tool_call_id)
        return attachment ? compactScreenshotToolMessage(message as ToolMessage, attachment) : message
    })

    const attachmentMessage = new HumanMessage({
        content: [
            {
                type: 'text',
                text: buildScreenshotAttachmentText(attachments)
            },
            ...attachments.map((attachment) => ({
                type: 'image_url',
                image_url: {
                    url: attachment.dataUrl,
                    detail: 'high'
                }
            }))
        ]
    })

    return {
        ...request,
        messages: [...messages, attachmentMessage]
    }
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
        message: HOST_PAGE_TOOL_DISPLAY_MESSAGES[HOST_PAGE_WAIT_TOOL_NAME],
        input,
        ...overrides
    }).catch((error) => {
        console.warn(
            '[BrowserAutomationMiddleware] dispatch wait tool message failed:',
            error instanceof Error ? error.message : String(error)
        )
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
                    displayMessages: HOST_PAGE_TOOL_DISPLAY_MESSAGES,
                    emitToolMessages: true,
                    transformToolMessage: compactBrowserAutomationToolMessage
                },
                context
            )
        )

        return {
            ...middleware,
            name: BROWSER_AUTOMATION_MIDDLEWARE_NAME,
            tools: [...(middleware.tools ?? []), createHostPageWaitTool()],
            wrapModelCall: async (request, handler) => {
                const preparedRequest = prepareHostPageScreenshotModelRequest(request)
                return middleware.wrapModelCall
                    ? middleware.wrapModelCall(preparedRequest, handler)
                    : handler(preparedRequest)
            }
        }
    }
}
