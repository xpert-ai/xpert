import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { MCP_APP_RESOURCE_MIME_TYPE } from '@xpert-ai/contracts'
import { McpConsumerResources } from '../resources/mcp-consumer-resources'
import { McpConsumerTools } from '../tools/mcp-consumer-tools'
import type { McpConsumerCallToolResult } from '../tools/mcp-consumer-call-tool-result'

export type McpConsumerApp = {
    serverName: string
    toolName: string
    title?: string
    resourceUri: string
}

export class McpConsumerApps {
    constructor(
        private readonly tools: McpConsumerTools,
        private readonly resources: McpConsumerResources,
        private readonly serverNames: () => string[]
    ) {}

    async list(serverName?: string): Promise<McpConsumerApp[]> {
        const names = serverName ? [serverName] : this.serverNames()
        const apps: McpConsumerApp[] = []
        for (const name of names) {
            for (const tool of await this.tools.list(name)) {
                const resourceUri = appResourceUri(tool._meta)
                if (resourceUri) {
                    apps.push({
                        serverName: name,
                        toolName: tool.name,
                        ...(typeof tool.title === 'string' ? { title: tool.title } : {}),
                        resourceUri
                    })
                }
            }
        }
        return apps
    }

    async read(app: McpConsumerApp): Promise<ReadResourceResult> {
        const result = await this.resources.read(app.resourceUri, app.serverName)
        const supported = result.contents.some((content) => content.mimeType === MCP_APP_RESOURCE_MIME_TYPE)
        if (!supported) {
            throw new Error(`MCP App Resource '${app.resourceUri}' did not return the MCP App MIME type`)
        }
        return result
    }

    call(
        app: McpConsumerApp,
        arguments_: Record<string, unknown> = {},
        signal?: AbortSignal
    ): Promise<McpConsumerCallToolResult> {
        return this.tools.call(app.toolName, arguments_, app.serverName, signal)
    }
}

function appResourceUri(meta: unknown) {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
    const ui = Reflect.get(meta, 'ui')
    if (typeof ui !== 'object' || ui === null || Array.isArray(ui)) return undefined
    const resourceUri = Reflect.get(ui, 'resourceUri')
    return typeof resourceUri === 'string' && resourceUri ? resourceUri : undefined
}
