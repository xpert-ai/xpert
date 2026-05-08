import { CallbackManager, type Callbacks } from '@langchain/core/callbacks/manager'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import type { Serialized } from '@langchain/core/load/serializable'
import { ToolMessage } from '@langchain/core/messages'
import { ToolCall } from '@langchain/core/messages/tool'
import { tool } from '@langchain/core/tools'
import { InferInteropZodInput, interopParse } from '@langchain/core/utils/types'
import { interrupt, isGraphInterrupt } from '@langchain/langgraph'
import { Injectable } from '@nestjs/common'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import type { ClientToolMessageInput, ClientToolRequest, ClientToolResponse } from '@xpert-ai/chatkit-types'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    JsonSchemaValidator,
    PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const contextSchema = z.object({
    /**
     * Client-side tool names.
     * These tool calls will be interrupted and executed on the UI client.
     */
    clientTools: z
        .array(
            z.object({
                name: z.string(),
                description: z.string().optional(),
                schema: z.string().optional()
            })
        )
        .default([]),
    /**
     * Internal display metadata for middleware wrappers that reuse ClientToolMiddleware.
     * This is intentionally omitted from the public config schema below.
     */
    displayToolset: z.string().optional(),
    displayToolsetId: z.string().optional(),
    emitToolMessages: z.boolean().optional()
})

export type ClientToolMiddlewareConfig = InferInteropZodInput<typeof contextSchema>

export const CLIENT_TOOL_MIDDLEWARE_NAME = 'ClientToolMiddleware'

function readCallbacks(value: unknown): Callbacks | undefined {
    if (value instanceof CallbackManager) {
        return value
    }

    if (Array.isArray(value)) {
        return value
    }

    return undefined
}

function readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined
    }

    const result: string[] = []
    for (const entry of value) {
        if (typeof entry !== 'string') {
            return undefined
        }
        result.push(entry)
    }

    return result
}

function readMetadata(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined
    }

    return Object.fromEntries(Object.entries(value))
}

function readStringField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
    if (!record) {
        return undefined
    }

    for (const key of keys) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) {
            return value.trim()
        }
    }

    return undefined
}

function stringifyValue(value: unknown): string {
    if (typeof value === 'string') {
        return value
    }

    if (value == null) {
        return ''
    }

    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }

    return stringifyValue(error) || 'Unknown error'
}

function isSerialized(value: unknown): value is Serialized {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }

    const lc = Reflect.get(value, 'lc')
    const type = Reflect.get(value, 'type')
    const id = Reflect.get(value, 'id')

    return (
        typeof lc === 'number' &&
        (type === 'constructor' || type === 'secret' || type === 'not_implemented') &&
        Array.isArray(id) &&
        id.every((entry) => typeof entry === 'string')
    )
}

function serializeToolForCallbacks(toolInstance: object, toolName: string): Serialized {
    const toJSON = Reflect.get(toolInstance, 'toJSON')
    if (typeof toJSON === 'function') {
        const serialized = toJSON.call(toolInstance)
        if (isSerialized(serialized)) {
            return serialized
        }
    }

    return {
        lc: 1,
        type: 'not_implemented',
        id: ['xpert-ai', 'client-tool', toolName],
        name: toolName
    }
}

function readRuntimeTracing(runtime: unknown) {
    if (!runtime || typeof runtime !== 'object') {
        return {}
    }

    return {
        callbacks: readCallbacks(Reflect.get(runtime, 'callbacks')),
        tags: readStringArray(Reflect.get(runtime, 'tags')),
        metadata: readMetadata(Reflect.get(runtime, 'metadata'))
    }
}

function toToolMessage(message: ClientToolMessageInput | ToolMessage, toolCall: ToolCall): ToolMessage {
    if (message instanceof ToolMessage) {
        return message
    }

    const toolCallId = message.tool_call_id ?? toolCall.id
    if (!toolCallId) {
        throw new Error(
            `Missing tool_call_id for client tool "${toolCall.name}". Provide tool_call_id in the response or ensure the tool call has an id.`
        )
    }

    let content: string
    if (typeof message.content === 'string') {
        content = message.content
    } else if (message.content == null) {
        content = ''
    } else {
        content = JSON.stringify(message.content)
    }

    return new ToolMessage({
        content,
        name: message.name ?? toolCall.name,
        tool_call_id: toolCallId,
        status: message.status,
        artifact: message.artifact
    })
}

type ClientToolDisplayConfig = {
    displayToolset?: string
    displayToolsetId?: string
}

type ClientToolStepStatus = 'running' | 'success' | 'fail'

type ClientToolStepEventOptions = {
    toolCall: ToolCall
    runtimeMetadata?: Record<string, unknown>
    displayConfig: ClientToolDisplayConfig
    status: ClientToolStepStatus
    createdAt: Date
    endAt?: Date
    output?: string
    artifact?: unknown
    error?: string
}

function getToolCallDisplayId(toolCall: ToolCall): string {
    if (typeof toolCall.id === 'string' && toolCall.id.trim()) {
        return toolCall.id.trim()
    }

    return `${toolCall.name}:${stringifyValue(toolCall.args)}`
}

function getToolCallDisplayMessage(toolCall: ToolCall): string | undefined {
    const args = toolCall.args
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return undefined
    }

    const message = Reflect.get(args, 'message')
    return typeof message === 'string' && message.trim() ? message.trim() : undefined
}

function mapClientToolStatus(status: ClientToolMessageInput['status'] | ToolMessage['status']): ClientToolStepStatus {
    return status === 'error' ? 'fail' : 'success'
}

async function dispatchClientToolStepEvent({
    toolCall,
    runtimeMetadata,
    displayConfig,
    status,
    createdAt,
    endAt,
    output,
    artifact,
    error
}: ClientToolStepEventOptions) {
    const toolName = toolCall.name
    const toolCallId = getToolCallDisplayId(toolCall)
    const toolset = displayConfig.displayToolset ?? readStringField(runtimeMetadata, ['toolset']) ?? CLIENT_TOOL_MIDDLEWARE_NAME
    const toolsetId = displayConfig.displayToolsetId ?? readStringField(runtimeMetadata, ['toolsetId'])
    const title = readStringField(runtimeMetadata, ['toolName', toolName]) ?? toolName
    const message = getToolCallDisplayMessage(toolCall)

    const payload = {
        id: toolCallId,
        tool_call_id: toolCall.id,
        category: 'Tool',
        type: ChatMessageStepCategory.Program,
        toolset,
        ...(toolsetId ? { toolset_id: toolsetId } : {}),
        tool: toolName,
        title,
        ...(message ? { message } : {}),
        status,
        created_date: createdAt,
        input: toolCall.args,
        ...(status === 'running' ? { end_date: null } : { end_date: endAt ?? new Date() }),
        ...(output !== undefined ? { output } : {}),
        ...(artifact !== undefined ? { artifact } : {}),
        ...(error ? { error } : {})
    }

    try {
        await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, payload)
    } catch (dispatchError) {
        console.warn('[ClientToolMiddleware] dispatch tool message failed:', getErrorMessage(dispatchError))
    }
}

@Injectable()
@AgentMiddlewareStrategy(CLIENT_TOOL_MIDDLEWARE_NAME)
export class ClientToolMiddleware implements IAgentMiddlewareStrategy {
    meta: TAgentMiddlewareMeta = {
        name: CLIENT_TOOL_MIDDLEWARE_NAME,
        label: {
            en_US: 'Client Tool Middleware',
            zh_Hans: '客户端工具中间件'
        },
        description: {
            en_US: 'Routes selected tool calls to the UI client via HITL interrupts and resumes with tool results.',
            zh_Hans: '将选定的工具调用通过 HITL 中断交给客户端执行，并在收到结果后继续对话。'
        },
        icon: {
            type: 'svg',
            value: `<?xml version="1.0" encoding="utf-8"?>
<svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16 7H8C5.79086 7 4 8.79086 4 11V17C4 19.2091 5.79086 21 8 21H16C18.2091 21 20 19.2091 20 17V11C20 8.79086 18.2091 7 16 7Z" stroke="currentColor" stroke-width="1.5"/>
<path d="M9 3V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M15 3V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 12L15 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 12L9 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
            color: 'blue'
        },
        configSchema: {
            type: 'object',
            properties: {
                clientTools: {
                    type: 'array',
                    title: {
                        en_US: 'Client Tools',
                        zh_Hans: '客户端工具'
                    },
                    description: {
                        en_US: 'Tool names that should run on the UI client.',
                        zh_Hans: '需要在 UI 客户端运行的工具名称。'
                    },
                    items: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                title: {
                                    en_US: 'Tool Name',
                                    zh_Hans: '工具名称'
                                },
                                description: {
                                    en_US: 'The name of the tool to be executed on the client side.',
                                    zh_Hans: '将在客户端执行的工具名称。'
                                }
                            },
                            description: {
                                type: 'string',
                                title: {
                                    en_US: 'Description',
                                    zh_Hans: '描述'
                                },
                                description: {
                                    en_US: 'A brief description of the tool.',
                                    zh_Hans: '工具的简要描述。'
                                },
                                'x-ui': {
                                    component: 'textarea'
                                }
                            },
                            schema: {
                                type: 'string',
                                title: {
                                    en_US: 'Arguments Schema',
                                    zh_Hans: '参数架构'
                                },
                                description: {
                                    en_US: 'JSON schema describing the tool arguments.',
                                    zh_Hans: '描述工具参数的 JSON Schema。'
                                },
                                'x-ui': {
                                    component: 'code-editor',
                                    inputs: {
                                        language: 'json',
                                        editable: true,
                                        lineNumbers: true
                                    },
                                    help: 'https://json-schema.org/learn/getting-started-step-by-step'
                                }
                            }
                        },
                        required: ['name']
                    },
                    'x-ui': {
                        span: 2
                    }
                }
            }
        } as TAgentMiddlewareMeta['configSchema']
    }

    createMiddleware(
        options: ClientToolMiddlewareConfig = {},
        _context: IAgentMiddlewareContext
    ): PromiseOrValue<AgentMiddleware> {
        void _context

        const tools = (options.clientTools || [])
            .filter((clientTool) => Boolean(clientTool))
            .map((clientTool) => {
                const schema = new JsonSchemaValidator().parseAndValidate(clientTool.schema)
                return tool(
                    async (input, config) => {
                        void input
                        void config
                        return ''
                    },
                    {
                        name: clientTool.name,
                        description: clientTool.description,
                        schema
                    }
                )
            })

        return {
            name: CLIENT_TOOL_MIDDLEWARE_NAME,
            tools,
            wrapToolCall: async (request, handler) => {
                const config = interopParse(contextSchema, options)
                if (!config?.clientTools?.length) {
                    return handler(request)
                }

                const isClientTool = config.clientTools.some((clientTool) => clientTool.name === request.toolCall.name)
                if (!isClientTool) {
                    return handler(request)
                }

                const runtimeConfig = readRuntimeTracing(request.runtime)
                const callbackManager = CallbackManager.configure(
                    runtimeConfig.callbacks,
                    undefined,
                    runtimeConfig.tags,
                    undefined,
                    runtimeConfig.metadata,
                    undefined
                )
                const serializedTool = serializeToolForCallbacks(request.tool, request.toolCall.name)
                const runManager = await callbackManager?.handleToolStart(
                    serializedTool,
                    JSON.stringify(request.toolCall),
                    request.toolCall.id,
                    undefined,
                    runtimeConfig.tags,
                    runtimeConfig.metadata
                )
                const shouldEmitToolMessages = config.emitToolMessages === true
                const createdAt = new Date()
                const displayConfig: ClientToolDisplayConfig = {
                    displayToolset: config.displayToolset,
                    displayToolsetId: config.displayToolsetId
                }
                if (shouldEmitToolMessages) {
                    await dispatchClientToolStepEvent({
                        toolCall: request.toolCall,
                        runtimeMetadata: runtimeConfig.metadata,
                        displayConfig,
                        status: 'running',
                        createdAt
                    })
                }

                try {
                    const clientRequest: ClientToolRequest = {
                        clientToolCalls: [request.toolCall]
                    }

                    const response = (await interrupt(clientRequest)) as ClientToolResponse
                    const toolMessages = response?.toolMessages

                    if (!Array.isArray(toolMessages) || toolMessages.length !== 1) {
                        throw new Error('Invalid ClientToolResponse: toolMessages must be an array with exactly one item')
                    }

                    const message = toolMessages[0]
                    if (message?.tool_call_id && request.toolCall.id && message.tool_call_id !== request.toolCall.id) {
                        throw new Error(
                            `Invalid ClientToolResponse: tool_call_id "${message.tool_call_id}" does not match "${request.toolCall.id}".`
                        )
                    }

                    const toolMessage = toToolMessage(message, request.toolCall)
                    await runManager?.handleToolEnd(toolMessage)
                    if (shouldEmitToolMessages) {
                        await dispatchClientToolStepEvent({
                            toolCall: request.toolCall,
                            runtimeMetadata: runtimeConfig.metadata,
                            displayConfig,
                            status: mapClientToolStatus(message.status ?? toolMessage.status),
                            createdAt,
                            endAt: new Date(),
                            output: stringifyValue(toolMessage.content),
                            artifact: toolMessage.artifact
                        })
                    }
                    return toolMessage
                } catch (error) {
                    if (isGraphInterrupt(error)) {
                        throw error
                    }

                    await runManager?.handleToolError(error)
                    if (shouldEmitToolMessages) {
                        await dispatchClientToolStepEvent({
                            toolCall: request.toolCall,
                            runtimeMetadata: runtimeConfig.metadata,
                            displayConfig,
                            status: 'fail',
                            createdAt,
                            endAt: new Date(),
                            error: getErrorMessage(error)
                        })
                    }
                    throw error
                }
            }
        }
    }
}
