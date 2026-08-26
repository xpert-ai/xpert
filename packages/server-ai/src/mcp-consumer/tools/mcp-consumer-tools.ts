import { DynamicStructuredTool } from '@langchain/core/tools'
import type { ToolSchemaBase } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { interrupt } from '@langchain/langgraph'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { HITLRequest, HITLResponse } from '@xpert-ai/contracts'
import { z } from 'zod'
import {
    MCP_CLIENT_CAPABILITIES_META_KEY,
    MCP_TASK_EXTENSION_ID,
    McpConsumerConnection
} from '../connection/mcp-consumer-connection'
import { McpConsumerTaskStart, mcpTaskStartResultSchema } from '../tasks/task-schemas'
import type {
    McpConsumerElicitationHandler,
    McpConsumerElicitationRequest,
    McpConsumerElicitationResult
} from '../elicitation/mcp-consumer-elicitation'
import { McpConsumerCallToolResult, mcpConsumerCallToolResultSchema } from './mcp-consumer-call-tool-result'
import { createMcpToolAppMeta, type McpToolLike } from '../../xpert-toolset/provider/mcp/app-support'

// Release bridge until xpert-pro consumes the ChatKit package with this additive metadata contract.
type MCPBooleanElicitationHITLRequest = HITLRequest & {
    elicitation: {
        kind: 'mcp_elicitation'
        actionName: string
        field: {
            name: string
            type: 'boolean'
            title?: string
            required: true
        }
    }
}

export class McpConsumerTools {
    private taskRunner?: (
        name: string,
        arguments_: Record<string, unknown>,
        serverName: string,
        signal?: AbortSignal,
        elicitationHandler?: McpConsumerElicitationHandler
    ) => Promise<unknown>

    constructor(
        private readonly connection: McpConsumerConnection,
        private readonly respondToInput?: (
            inputRequests: Record<string, unknown>,
            serverName?: string,
            handler?: McpConsumerElicitationHandler
        ) => Promise<object>
    ) {}

    setTaskRunner(
        runner: (
            name: string,
            arguments_: Record<string, unknown>,
            serverName: string,
            signal?: AbortSignal,
            elicitationHandler?: McpConsumerElicitationHandler
        ) => Promise<unknown>
    ) {
        this.taskRunner = runner
    }

    async list(serverName?: string): Promise<Tool[]> {
        if (this.connection.usesModernHttp(serverName)) {
            const tools: Tool[] = []
            let cursor: string | undefined
            do {
                const response = await this.connection.requestExtension(
                    serverName,
                    { method: 'tools/list', params: cursor ? { cursor } : {} },
                    ListToolsResultSchema,
                    { routing: { method: 'tools/list' } }
                )
                tools.push(...response.tools)
                cursor = response.nextCursor
            } while (cursor)
            return tools
        }
        const client = await this.connection.getClient(serverName)
        const tools: Tool[] = []
        let cursor: string | undefined
        do {
            const response = await client.listTools(cursor ? { cursor } : undefined)
            tools.push(...response.tools)
            cursor = response.nextCursor
        } while (cursor)
        return tools
    }

    async call(
        name: string,
        arguments_: Record<string, unknown> = {},
        serverName?: string,
        signal?: AbortSignal,
        elicitationHandler?: McpConsumerElicitationHandler
    ): Promise<McpConsumerCallToolResult> {
        if (this.connection.usesModernHttp(serverName)) {
            let inputResponses: object | undefined
            let requestState: string | undefined
            for (let round = 0; round < 8; round += 1) {
                const response = await this.connection.requestExtension(
                    serverName,
                    {
                        method: 'tools/call',
                        params: {
                            name,
                            arguments: arguments_,
                            ...(inputResponses ? { inputResponses } : {}),
                            ...(requestState ? { requestState } : {})
                        }
                    },
                    callToolResponseSchema,
                    { signal, routing: { method: 'tools/call', name } }
                )
                const inputRequired = inputRequiredResultSchema.safeParse(response)
                if (!inputRequired.success) return mcpConsumerCallToolResultSchema.parse(response)
                if (!this.respondToInput) throw new Error('No MCP input-required handler is configured')
                inputResponses = await this.respondToInput(
                    inputRequired.data.inputRequests ?? {},
                    serverName,
                    elicitationHandler
                )
                requestState = inputRequired.data.requestState
            }
            throw new Error('MCP tool input-required flow exceeded 8 rounds')
        }
        const client = await this.connection.getClient(serverName)
        return mcpConsumerCallToolResultSchema.parse(
            await client.callTool({ name, arguments: arguments_ }, undefined, signal ? { signal } : undefined)
        )
    }

    async startTask(
        name: string,
        arguments_: Record<string, unknown> = {},
        serverName?: string,
        signal?: AbortSignal
    ): Promise<McpConsumerTaskStart> {
        return this.connection.requestExtension(
            serverName,
            {
                method: 'tools/call',
                params: {
                    name,
                    arguments: arguments_,
                    _meta: taskCapabilityMeta()
                }
            },
            mcpTaskStartResultSchema,
            {
                signal,
                routing: { method: 'tools/call', name }
            }
        )
    }

    async asLangChain(serverNames?: string[]): Promise<DynamicStructuredTool[]> {
        const selectedServerNames = serverNames?.length ? serverNames : this.connection.serverNames()
        const modernServerNames = selectedServerNames.filter((serverName) => this.connection.usesModernHttp(serverName))
        const legacyServerNames = selectedServerNames.filter(
            (serverName) => !this.connection.usesModernHttp(serverName)
        )
        const tools = legacyServerNames.length ? await this.connection.getLangChainTools(legacyServerNames) : []

        for (const serverName of modernServerNames) {
            for (const tool of await this.list(serverName)) {
                tools.push(this.createModernLangChainTool(serverName, tool))
            }
        }
        return tools
    }

    private createModernLangChainTool(serverName: string, tool: Tool): DynamicStructuredTool {
        const displayName = this.connection.formatToolName(serverName, tool.name)
        const inputSchema = {
            type: 'object' as const,
            ...tool.inputSchema,
            properties: tool.inputSchema.properties ?? {}
        } as ToolSchemaBase
        const appMeta = createMcpToolAppMeta(serverName, displayName, modernToolMetadata(tool))
        return new DynamicStructuredTool<ToolSchemaBase>({
            name: displayName,
            description: tool.description ?? '',
            schema: inputSchema,
            responseFormat: 'content_and_artifact',
            metadata: {
                annotations: tool.annotations,
                mcpApp: appMeta
            },
            func: async (input, _runManager, config) => {
                const arguments_ = copyToolArguments(input)
                const elicitationHandler = elicitationHandlerFromConfig(config)
                const result =
                    appMeta.execution?.taskSupport === 'required'
                        ? mcpConsumerCallToolResultSchema.parse(
                              await this.requireTaskRunner()(
                                  tool.name,
                                  arguments_,
                                  serverName,
                                  config?.signal,
                                  elicitationHandler
                              )
                          )
                        : await this.call(tool.name, arguments_, serverName, config?.signal, elicitationHandler)
                return toLangChainToolResult(serverName, tool.name, result)
            }
        })
    }

    private requireTaskRunner() {
        if (!this.taskRunner) throw new Error('MCP task runner is not configured')
        return this.taskRunner
    }
}

const inputRequiredResultSchema = z
    .object({
        resultType: z.literal('input_required'),
        inputRequests: z.record(z.unknown()).optional(),
        requestState: z.string().optional()
    })
    .passthrough()

const callToolResponseSchema = z.union([inputRequiredResultSchema, mcpConsumerCallToolResultSchema])

export function taskCapabilityMeta() {
    return {
        [MCP_CLIENT_CAPABILITIES_META_KEY]: {
            extensions: {
                [MCP_TASK_EXTENSION_ID]: {}
            }
        }
    }
}

function modernToolMetadata(tool: Tool): McpToolLike {
    const metaValue = Reflect.get(tool, '_meta')
    const executionValue = Reflect.get(tool, 'execution')
    const taskSupport =
        typeof executionValue === 'object' && executionValue !== null && !Array.isArray(executionValue)
            ? Reflect.get(executionValue, 'taskSupport')
            : undefined
    return {
        name: tool.name,
        inputSchema: Object.fromEntries(Object.entries(tool.inputSchema)),
        annotations: tool.annotations,
        ...(taskSupport === 'required' || taskSupport === 'optional' || taskSupport === 'forbidden'
            ? { execution: { taskSupport } }
            : {}),
        ...(typeof metaValue === 'object' && metaValue !== null && !Array.isArray(metaValue)
            ? { _meta: Object.fromEntries(Object.entries(metaValue)) }
            : {})
    }
}

function copyToolArguments(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : {}
}

function toLangChainToolResult(serverName: string, toolName: string, result: McpConsumerCallToolResult) {
    if (result.isError) {
        const message = result.content
            .filter((content) => content.type === 'text')
            .map((content) => content.text)
            .join('\n')
        throw new Error(`MCP tool '${toolName}' on server '${serverName}' returned an error: ${message}`)
    }

    const content: unknown[] = []
    const artifacts: unknown[] = []
    for (const block of result.content) {
        switch (block.type) {
            case 'text':
                content.push({ type: 'text', text: block.text })
                break
            case 'image':
                content.push({
                    type: 'image_url',
                    image_url: { url: `data:${block.mimeType};base64,${block.data}` }
                })
                break
            case 'audio':
                content.push({
                    type: 'audio',
                    source_type: 'base64',
                    data: block.data,
                    mime_type: block.mimeType
                })
                break
            case 'resource':
            case 'resource_link':
                artifacts.push(block)
                break
        }
    }

    const resultArtifact: Record<string, unknown> = {}
    if (result.structuredContent !== undefined) resultArtifact.structuredContent = result.structuredContent
    if (result._meta !== undefined) resultArtifact._meta = result._meta
    if (result.isError !== undefined) resultArtifact.isError = result.isError
    if (Object.keys(resultArtifact).length) artifacts.push(resultArtifact)

    if (!content.length && result.structuredContent !== undefined) {
        content.push({ type: 'text', text: JSON.stringify(result.structuredContent) })
    }
    const modelContent = content.length === 1 && isTextBlock(content[0]) ? content[0].text : content
    return [modelContent, artifacts]
}

function isTextBlock(value: unknown): value is { type: 'text'; text: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Reflect.get(value, 'type') === 'text' &&
        typeof Reflect.get(value, 'text') === 'string'
    )
}

function elicitationHandlerFromConfig(config?: RunnableConfig): McpConsumerElicitationHandler | undefined {
    const executionContext = config?.configurable?.toolExecutionContext
    if (typeof executionContext !== 'object' || executionContext === null || Array.isArray(executionContext)) {
        return approvalInterruptHandler
    }
    const host = Reflect.get(executionContext, 'host')
    if (typeof host !== 'object' || host === null || Array.isArray(host)) return approvalInterruptHandler
    const input = Reflect.get(host, 'input')
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return approvalInterruptHandler
    const requestInput = Reflect.get(input, 'request')
    if (typeof requestInput !== 'function') return approvalInterruptHandler

    return async (request) => {
        const response = await Reflect.apply(requestInput, input, [toToolInputRequest(request)])
        if (response === undefined || response === null) return { action: 'accept' }
        if (typeof response !== 'object' || Array.isArray(response)) {
            throw new Error('MCP elicitation host response must be an object')
        }
        return { action: 'accept', content: Object.fromEntries(Object.entries(response)) }
    }
}

async function approvalInterruptHandler(request: McpConsumerElicitationRequest): Promise<McpConsumerElicitationResult> {
    const field = approvalBooleanField(request)
    if (!field) {
        throw new Error('ChatKit MCP Elicitation currently supports one required boolean approval field')
    }
    const actionName = 'MCP Elicitation'
    const hitlRequest: MCPBooleanElicitationHITLRequest = {
        elicitation: {
            kind: 'mcp_elicitation',
            actionName,
            field: {
                name: field.name,
                type: 'boolean',
                ...(field.title ? { title: field.title } : {}),
                required: true
            }
        },
        actionRequests: [
            {
                name: actionName,
                args: { [field.name]: false },
                description: request.message
            }
        ],
        reviewConfigs: [
            {
                actionName,
                allowedDecisions: ['approve', 'reject'],
                argsSchema: field.schema
            }
        ]
    }
    const response = interrupt(hitlRequest) as HITLResponse
    const decision = response.decisions?.[0]
    if (decision?.type === 'approve') {
        return { action: 'accept', content: { [field.name]: true } }
    }
    if (decision?.type === 'reject') {
        return { action: 'accept', content: { [field.name]: false } }
    }
    throw new Error('ChatKit MCP Elicitation returned an unsupported approval decision')
}

function approvalBooleanField(
    request: McpConsumerElicitationRequest
): { name: string; title?: string; schema: Record<string, unknown> } | null {
    if (request.mode === 'url') return null
    const properties = Reflect.get(request.requestedSchema, 'properties')
    const required = Reflect.get(request.requestedSchema, 'required')
    if (
        typeof properties !== 'object' ||
        properties === null ||
        Array.isArray(properties) ||
        !Array.isArray(required)
    ) {
        return null
    }
    const names = Object.keys(properties)
    if (names.length !== 1 || required.length !== 1 || required[0] !== names[0]) return null
    const property = Reflect.get(properties, names[0])
    if (typeof property !== 'object' || property === null || Array.isArray(property)) return null
    const title = Reflect.get(property, 'title')
    return Reflect.get(property, 'type') === 'boolean'
        ? {
              name: names[0],
              ...(typeof title === 'string' && title.trim() ? { title: title.trim() } : {}),
              schema: Object.fromEntries(Object.entries(request.requestedSchema))
          }
        : null
}

function toToolInputRequest(request: McpConsumerElicitationRequest) {
    if (request.mode === 'url') {
        return {
            type: 'url' as const,
            url: request.url,
            ...(request.message ? { title: request.message } : {})
        }
    }
    return {
        type: 'form' as const,
        title: request.message,
        schema: JSON.parse(JSON.stringify(request.requestedSchema))
    }
}
