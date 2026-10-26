import { McpControlError } from '../../../mcp-consumer/execution/mcp-control.error'
import { mcpConnectionVersion } from '../../../mcp-consumer/runtime/mcp-connection-version'
import { ExecuteMcpOperationCommand } from '../../../mcp-consumer/execution/mcp-operation.command'
import { readMcpAppExecutionContext } from '../../../mcp-app-runtime/mcp-app-execution-context'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import {
    ChatMessageEventTypeEnum,
    I18nObject,
    IXpertToolset,
    XpertToolsetCategoryEnum,
    getToolCallIdFromConfig
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import type {
    McpCompletionResult,
    McpPromptContent,
    McpPromptResult,
    McpResourceContent,
    McpResourceReadResult,
    ToolInputApi,
    ToolInputRequest
} from '@xpert-ai/plugin-sdk'
import { Logger } from '@nestjs/common'
import { LangChainMcpConnection } from '../../../mcp-consumer/connection/langchain-mcp-connection'
import type { McpConsumerElicitationHandler } from '../../../mcp-consumer/elicitation/mcp-consumer-elicitation'
import { McpConsumer } from '../../../mcp-consumer/mcp-consumer'
import type { McpConsumerCallToolResult } from '../../../mcp-consumer/tools/mcp-consumer-call-tool-result'
import { createProMCPClient } from './pro'
import { createMCPClient } from './types'
import type { TBuiltinToolsetParams } from '../../../shared/tools/builtin'
import { _BaseToolset } from '../../../shared/tools/toolset'
import {
    buildMcpAppComponentMessage,
    detachMcpAppInstancesForClient,
    registerMcpAppInstance,
    waitForMcpAppInstancePersistence
} from './app-support'
import { mcpStdioRuntimeManager } from './mcp-stdio-runtime'
import { filterMcpTools } from './mcp-tool-filter'
import { buildMcpTaskStatusMessage } from './mcp-task-status'

function isObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

function closeEventSource(value: unknown) {
    if (!isObject(value)) {
        return
    }

    Reflect.set(value, 'onerror', null)
    Reflect.set(value, 'onmessage', null)
    Reflect.set(value, 'onopen', null)

    const close = Reflect.get(value, 'close')
    if (typeof close === 'function') {
        close.call(value)
    }
}

function forceCloseSSETransport(transport: unknown) {
    if (!isObject(transport)) {
        return
    }

    const abortController = Reflect.get(transport, '_abortController')
    if (isObject(abortController)) {
        const abort = Reflect.get(abortController, 'abort')
        if (typeof abort === 'function') {
            abort.call(abortController)
        }
    }

    closeEventSource(Reflect.get(transport, '_eventSource'))
    Reflect.set(transport, '_eventSource', undefined)
    Reflect.set(transport, '_endpoint', undefined)
}

function forceCloseMCPClientTransports(client: MultiServerMCPClient) {
    const transportInstances = Reflect.get(client, '_transportInstances')
    if (!isObject(transportInstances)) {
        return
    }

    for (const key of Object.keys(transportInstances)) {
        forceCloseSSETransport(Reflect.get(transportInstances, key))
    }
}

function wrapMCPTool(
    tool: DynamicStructuredTool,
    client: MultiServerMCPClient,
    toolset: IXpertToolset,
    context?: Partial<TBuiltinToolsetParams>
) {
    return new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
        returnDirect: tool.returnDirect,
        responseFormat: tool.responseFormat,
        defaultConfig: tool.defaultConfig,
        verboseParsingErrors: tool.verboseParsingErrors,
        metadata: tool.metadata,
        func: async (input, runManager, config) => {
            const runnableConfig = config
            mcpStdioRuntimeManager.touchClient(client)
            const result = await tool.func(input, runManager, runnableConfig)
            const appData = registerMcpAppInstance({
                client,
                userId: context?.userId,
                executionContext: readMcpAppExecutionContext(context),
                toolset,
                tool,
                toolCallId: config ? getToolCallIdFromConfig(config) : undefined,
                toolInput: input,
                toolResult: result
            })
            if (appData) {
                await waitForMcpAppInstancePersistence(appData.appInstanceId)
                await dispatchCustomEvent(
                    ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
                    buildMcpAppComponentMessage(appData)
                )
            }
            return result
        }
    })
}

export class MCPToolset extends _BaseToolset {
    providerName = 'mcp'
    providerType = XpertToolsetCategoryEnum.MCP

    readonly #logger = new Logger(MCPToolset.name)

    // MCP Client
    protected client: MultiServerMCPClient = null
    protected consumer: McpConsumer = null
    private readonly executionDrains = new Set<Promise<void>>()
    protected destroy: (() => Promise<void>) | null = null
    constructor(
        protected toolset: IXpertToolset,
        protected params?: TBuiltinToolsetParams
    ) {
        super(params)
    }

    getId(): string {
        return this.toolset.id
    }
    getName(): string {
        return this.toolset.name
    }

    async initTools() {
        const { client, destroy } = environment.pro
            ? await createProMCPClient(
                  this.toolset,
                  undefined,
                  this.params.commandBus,
                  JSON.parse(this.toolset.schema),
                  this.params.env,
                  this.params?.xpertId,
                  this.params
              )
            : await createMCPClient(
                  this.toolset,
                  JSON.parse(this.toolset.schema),
                  this.params.env,
                  this.params?.xpertId,
                  this.params
              )
        this.client = client
        const connectionVersion = mcpConnectionVersion(this.toolset)
        this.consumer = new McpConsumer(new LangChainMcpConnection(client), (input) => {
            if (!this.params?.commandBus) throw new McpControlError('scope')
            return this.params.commandBus.execute(
                new ExecuteMcpOperationCommand({
                    ...input,
                    connectionVersion,
                    authority: this.params?.xpertId
                        ? {
                              kind: 'assistant',
                              xpertId: this.params.xpertId,
                              ...(this.params.projectId ? { projectId: this.params.projectId } : {})
                          }
                        : undefined,
                    toolsetId: this.toolset.id,
                    consumer: this.consumer,
                    retain: (drain) => {
                        this.executionDrains.add(drain)
                        void drain.then(() => this.executionDrains.delete(drain))
                    }
                })
            )
        })
        this.destroy = destroy
        const tools = await this.consumer.tools.asLangChain()
        this.tools = filterMcpTools(this.toolset, tools).map((tool) =>
            wrapMCPTool(tool, client, this.toolset, this.params)
        )
        this.tools.forEach((tool) => ((<DynamicStructuredTool>tool).verboseParsingErrors = true))
        return this.tools
    }

    getTools() {
        return this.tools
    }

    async callMcpTool(
        name: string,
        arguments_: Record<string, unknown>,
        serverName?: string,
        signal?: AbortSignal,
        input?: ToolInputApi,
        operationKey?: string
    ): Promise<McpConsumerCallToolResult> {
        const consumer = await this.getMcpConsumer()
        return consumer.tools.call(
            name,
            arguments_,
            serverName,
            signal,
            input ? createRemoteElicitationHandler(input) : undefined,
            operationKey
        )
    }

    async callMcpTaskTool(
        name: string,
        arguments_: Record<string, unknown>,
        serverName: string,
        signal?: AbortSignal,
        input?: ToolInputApi,
        operationKey?: string
    ): Promise<unknown> {
        const consumer = await this.getMcpConsumer()
        return consumer.runTask({
            mode: 'task',
            toolName: name,
            arguments: arguments_,
            serverName,
            signal,
            operationKey,
            input: input ? createRemoteElicitationHandler(input) : undefined,
            onStatus: (task) =>
                dispatchCustomEvent(
                    ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
                    buildMcpTaskStatusMessage({ task, toolset: this.toolset, serverName, toolName: name })
                )
        })
    }

    async readMcpResource(uri: string, serverName?: string): Promise<McpResourceReadResult> {
        const consumer = await this.getMcpConsumer()
        const result = await consumer.resources.read(uri, serverName)
        return {
            contents: result.contents.map(normalizeResourceContent)
        }
    }

    async getMcpPrompt(
        name: string,
        arguments_: Record<string, string>,
        serverName?: string
    ): Promise<McpPromptResult> {
        const consumer = await this.getMcpConsumer()
        const result = await consumer.prompts.get(name, arguments_, serverName)
        return {
            ...(result.description ? { description: result.description } : {}),
            messages: result.messages.map((message) => ({
                role: message.role,
                content: normalizePromptContent(message.content)
            }))
        }
    }

    async completeMcpCapability(
        reference: { type: 'resource'; value: string } | { type: 'prompt'; value: string },
        argument: { name: string; value: string },
        serverName?: string
    ): Promise<McpCompletionResult> {
        const consumer = await this.getMcpConsumer()
        const result = await consumer.completion.complete(
            reference.type === 'resource'
                ? { type: 'resource', uri: reference.value }
                : { type: 'prompt', name: reference.value },
            argument,
            serverName
        )
        return {
            values: Array.isArray(result.completion.values)
                ? result.completion.values.filter((value): value is string => typeof value === 'string')
                : [],
            ...(typeof result.completion.total === 'number' ? { total: result.completion.total } : {}),
            ...(typeof result.completion.hasMore === 'boolean' ? { hasMore: result.completion.hasMore } : {})
        }
    }

    getTool(toolName: string) {
        if (!this.tools) {
            this.getTools()
        }

        for (const tool of this.tools) {
            if (tool.name === toolName) {
                return tool
            }
        }

        throw new Error(`tool ${toolName} not found`)
    }

    /**
     * @todo
     */
    getToolTitle(name: string): string | I18nObject {
        const tool = this.toolset?.tools?.find((tool) => tool.name === name)
        const identity = tool?.schema?.entity
        if (identity) {
            return identity
        }
        return null
    }

    async close() {
        const client = this.client,
            destroy = this.destroy
        if (!client) return
        this.client = null
        this.consumer = null
        this.destroy = null
        const cleanup = async () => {
            try {
                detachMcpAppInstancesForClient(client)
                forceCloseMCPClientTransports(client)
                await destroy?.()
            } finally {
                await client.close().catch((err) => this.#logger.debug(err))
                forceCloseMCPClientTransports(client)
            }
        }
        // A caller ending its wait cannot kill a shared/independent task in the original stdio host.
        if (this.executionDrains.size) {
            void Promise.allSettled([...this.executionDrains])
                .then(cleanup)
                .catch((err) => this.#logger.debug(err))
            return
        }
        await cleanup()
    }

    async getMcpConsumer() {
        if (!this.consumer) {
            await this.initTools()
        }
        return this.consumer
    }
}

function normalizeResourceContent(content: unknown): McpResourceContent {
    if (typeof content !== 'object' || content === null) {
        throw new Error('Remote MCP Resource returned invalid content')
    }
    const uri = Reflect.get(content, 'uri')
    const mimeType = Reflect.get(content, 'mimeType')
    const text = Reflect.get(content, 'text')
    const blob = Reflect.get(content, 'blob')
    const meta = Reflect.get(content, '_meta')
    if (typeof uri !== 'string' || (typeof text !== 'string' && typeof blob !== 'string')) {
        throw new Error('Remote MCP Resource returned invalid content')
    }
    return {
        uri,
        ...(typeof mimeType === 'string' ? { mimeType } : {}),
        ...(typeof text === 'string' ? { text } : { blob }),
        ...(typeof meta === 'object' && meta !== null && !Array.isArray(meta)
            ? { meta: JSON.parse(JSON.stringify(meta)) }
            : {})
    }
}

function normalizePromptContent(content: unknown): McpPromptContent {
    if (typeof content !== 'object' || content === null) {
        throw new Error('Remote MCP Prompt returned invalid content')
    }
    const type = Reflect.get(content, 'type')
    if (type === 'text') {
        const text = Reflect.get(content, 'text')
        if (typeof text === 'string') return { type, text }
    }
    if (type === 'image' || type === 'audio') {
        const data = Reflect.get(content, 'data')
        const mimeType = Reflect.get(content, 'mimeType')
        if (typeof data === 'string' && typeof mimeType === 'string') return { type, data, mimeType }
    }
    if (type === 'resource') {
        const resource = Reflect.get(content, 'resource')
        if (typeof resource === 'object' && resource !== null) {
            const normalized = normalizeResourceContent(resource)
            return { type, ...normalized }
        }
    }
    throw new Error('Remote MCP Prompt returned invalid content')
}

function createRemoteElicitationHandler(input: ToolInputApi): McpConsumerElicitationHandler {
    return async (request) => {
        const content = await input.request(
            parseRemoteTaskInputRequest({ method: 'elicitation/create', params: request })
        )
        if (content === null || typeof content !== 'object' || Array.isArray(content)) {
            throw new Error('Remote MCP elicitation response must be an object')
        }
        return { action: 'accept', content: Object.fromEntries(Object.entries(content)) }
    }
}

function parseRemoteTaskInputRequest(value: unknown): ToolInputRequest {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Remote MCP task returned an invalid input request')
    }
    const method = Reflect.get(value, 'method')
    const params = Reflect.get(value, 'params')
    if (method !== 'elicitation/create' || typeof params !== 'object' || params === null || Array.isArray(params)) {
        throw new Error('Remote MCP task requested an unsupported input method')
    }
    const mode = Reflect.get(params, 'mode')
    const message = Reflect.get(params, 'message')
    if (mode === 'url') {
        const url = Reflect.get(params, 'url')
        if (typeof url !== 'string') throw new Error('Remote MCP task returned an invalid URL input request')
        return {
            type: 'url',
            url,
            ...(typeof message === 'string' ? { title: message } : {})
        }
    }
    const schema = Reflect.get(params, 'requestedSchema')
    if (mode !== 'form' || typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
        throw new Error('Remote MCP task returned an invalid form input request')
    }
    return {
        type: 'form',
        title: typeof message === 'string' ? message : 'Additional input required',
        schema: JSON.parse(JSON.stringify(schema))
    }
}
