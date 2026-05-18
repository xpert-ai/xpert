import type { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Why this exists:
 * @langchain/mcp-adapters currently applies outputHandling to CallToolResult.content,
 * but does not expose CallToolResult._meta as a LangChain ToolMessage artifact.
 * Xpert MCP servers use _meta for UI-only data that must stay out of model-visible
 * content, so this compatibility bridge carries _meta through the artifact side channel.
 * Remove it once the upstream MCP adapter/client supports that mapping natively.
 */
const bridgedMcpClients = new WeakSet<MultiServerMCPClient>()
const bridgedSdkClients = new WeakSet<Client>()
const bridgedTools = new WeakSet<object>()
const mcpMetaCaptureStorage = new AsyncLocalStorage<McpMetaCapture>()

type McpMetaCapture = {
    meta?: CallToolResult['_meta']
}

type ClientContainer = {
    _clients?: unknown
}

type SdkClientCandidate = {
    callTool?: unknown
}

type McpToolWithFunc = {
    func: (...args: [unknown, unknown?, unknown?]) => Promise<unknown>
}

function isObject(value: unknown): value is object {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSdkClient(value: unknown): value is Client {
    if (!isObject(value)) {
        return false
    }

    const candidate = value as SdkClientCandidate
    return typeof candidate.callTool === 'function'
}

function isMcpToolWithFunc(value: unknown): value is McpToolWithFunc {
    if (!isObject(value)) {
        return false
    }

    return typeof (value as { func?: unknown }).func === 'function'
}

function hasMcpMeta(result: CallToolResult): boolean {
    return result._meta !== undefined
}

export function mapMcpMetaToToolArtifact(toolResult: unknown, meta: CallToolResult['_meta']): unknown {
    if (!Array.isArray(toolResult) || toolResult.length !== 2) {
        return toolResult
    }

    const [content, artifact] = toolResult
    if (artifact === undefined || (Array.isArray(artifact) && artifact.length === 0)) {
        return [content, meta]
    }

    if (Array.isArray(artifact)) {
        return [content, [...artifact, meta]]
    }

    return [content, [artifact, meta]]
}

export function installMcpClientMetaArtifactBridge(client: Client): void {
    if (bridgedSdkClients.has(client)) {
        return
    }
    bridgedSdkClients.add(client)

    const originalCallTool = client.callTool.bind(client)
    client.callTool = (async (...args: Parameters<Client['callTool']>) => {
        const result = await originalCallTool(...args)
        const capture = mcpMetaCaptureStorage.getStore()
        if (capture && hasMcpMeta(result)) {
            capture.meta = result._meta
        }
        return result
    }) as Client['callTool']
}

function installBridgeOnTool(tool: McpToolWithFunc): void {
    if (bridgedTools.has(tool)) {
        return
    }
    bridgedTools.add(tool)

    const originalFunc = tool.func.bind(tool)
    tool.func = async (...args: [unknown, unknown?, unknown?]) => {
        const capture: McpMetaCapture = {}
        // Tool calls can overlap; AsyncLocalStorage keeps the captured _meta tied to this call.
        const result = await mcpMetaCaptureStorage.run(capture, () => originalFunc(...args))
        return capture.meta === undefined ? result : mapMcpMetaToToolArtifact(result, capture.meta)
    }
}

function installBridgeOnTools(tools: unknown): void {
    if (!Array.isArray(tools)) {
        return
    }

    for (const tool of tools) {
        if (isMcpToolWithFunc(tool)) {
            installBridgeOnTool(tool)
        }
    }
}

function installBridgeOnConnectedClients(client: MultiServerMCPClient): void {
    const clients = (client as unknown as ClientContainer)._clients
    if (!isObject(clients)) {
        return
    }

    for (const sdkClient of Object.values(clients)) {
        if (isSdkClient(sdkClient)) {
            installMcpClientMetaArtifactBridge(sdkClient)
        }
    }
}

export function installMcpMetaArtifactBridge(client: MultiServerMCPClient): void {
    if (bridgedMcpClients.has(client)) {
        return
    }
    bridgedMcpClients.add(client)

    const originalGetTools = client.getTools.bind(client)
    client.getTools = async (...servers: string[]) => {
        const tools = await originalGetTools(...servers)
        installBridgeOnConnectedClients(client)
        installBridgeOnTools(tools)
        return tools
    }

    const originalGetClient = client.getClient.bind(client)
    client.getClient = async (serverName: string) => {
        const sdkClient = await originalGetClient(serverName)
        if (sdkClient) {
            installMcpClientMetaArtifactBridge(sdkClient)
        }
        return sdkClient
    }
}
