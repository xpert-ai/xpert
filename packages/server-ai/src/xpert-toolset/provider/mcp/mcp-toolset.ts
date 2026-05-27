import { DynamicStructuredTool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { I18nObject, isToolEnabled, IXpertToolset, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { Logger } from '@nestjs/common'
import { createProMCPClient } from './pro'
import { createMCPClient } from './types'
import { _BaseToolset, TBuiltinToolsetParams } from '../../../shared'

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

function omitSignalFromRunnableConfig(config?: RunnableConfig) {
    if (!config?.signal) {
        return config
    }

    const nextConfig: RunnableConfig = { ...config }
    delete nextConfig.signal
    return nextConfig
}

function wrapMCPTool(tool: DynamicStructuredTool) {
    return new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
        returnDirect: tool.returnDirect,
        responseFormat: tool.responseFormat,
        defaultConfig: omitSignalFromRunnableConfig(tool.defaultConfig),
        verboseParsingErrors: tool.verboseParsingErrors,
        metadata: tool.metadata,
        func: (input, runManager, config) => tool.func(input, runManager, omitSignalFromRunnableConfig(config))
    })
}

export class MCPToolset extends _BaseToolset {
    providerName = 'mcp'
    providerType = XpertToolsetCategoryEnum.MCP

    readonly #logger = new Logger(MCPToolset.name)

    // MCP Client
    protected client: MultiServerMCPClient = null
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
        const { client } = environment.pro
            ? await createProMCPClient(
                  this.toolset,
                  this.params?.signal,
                  this.params.commandBus,
                  JSON.parse(this.toolset.schema),
                  this.params.env,
                  this.params?.xpertId
              )
            : await createMCPClient(
                  this.toolset,
                  JSON.parse(this.toolset.schema),
                  this.params.env,
                  this.params?.xpertId
              )
        this.client = client
        const tools = await this.client.getTools()
        // Filter tools by custom instance config
        const disableToolDefault = this.toolset.options?.disableToolDefault
        this.tools = tools
            .filter((tool) => {
                const config = this.toolset.tools?.find((_) => _.name === tool.name)
                if (config) {
                    return isToolEnabled(config, disableToolDefault)
                }
                return disableToolDefault
            })
            .map((tool) => wrapMCPTool(tool))
        this.tools.forEach((tool) => ((<DynamicStructuredTool>tool).verboseParsingErrors = true))
        return this.tools
    }

    getTools() {
        return this.tools
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
        if (!this.client) {
            return
        }

        forceCloseMCPClientTransports(this.client)
        await this.client.close()
        forceCloseMCPClientTransports(this.client)
        this.#logger.debug(`closed mcp toolset '${this.toolset.name}'.`)
    }
}
