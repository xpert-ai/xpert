import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { PromptTemplate } from '@langchain/core/prompts'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import {
    ChatMessageEventTypeEnum,
    IXpertToolset,
    MCPServerType,
    TChatEventMessage,
    TMCPSchema,
    TMCPServer
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { runScript } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { isNil, omitBy } from 'lodash'
import { buildMCPHeaders } from './headers'
import { installMcpMetaArtifactBridge } from './meta-artifact-bridge'
import { installMcpToolAppMetadataBridge, installMcpUiClientCapabilitiesBridge } from './app-support'
import { resolvePluginManagedMcpSchema } from './plugin-managed-runtime'
import { McpStdioRuntimeHandle, mcpStdioRuntimeManager } from './mcp-stdio-runtime'
import type { TBuiltinToolsetParams } from '../../../shared'

export async function createMCPClient(
    toolset: Partial<IXpertToolset>,
    schema: TMCPSchema,
    envState: Record<string, unknown>,
    xpertId?: string,
    runtimeContext: Partial<TBuiltinToolsetParams> = {}
) {
    const logs: string[] = []
    const mcpServers = {}
    const stdioRuntimes: McpStdioRuntimeHandle[] = []
    let server: TMCPServer = null
    const resolvedSchema = resolvePluginManagedMcpSchema(toolset, schema)
    const servers = resolvedSchema.servers ?? resolvedSchema.mcpServers
    // Connect to a remote server via SSE or HTTP
    for await (const serverName of Object.keys(servers)) {
        server = servers[serverName]
        const name = serverName || toolset.name || 'default'
        const transport = server.type?.toLowerCase()
        if (transport === MCPServerType.HTTP) {
            const headers = await buildMCPHeaders(server.headers, envState, xpertId)
            mcpServers[name] = omitBy(
                {
                    ...server,
                    transport: 'http',
                    headers
                },
                isNil
            )
        } else if (transport === MCPServerType.SSE || (!transport && server.url)) {
            const headers = await buildMCPHeaders(server.headers, envState, xpertId)
            mcpServers[name] = omitBy(
                {
                    ...server,
                    headers,
                    useNodeEventSource: true
                },
                isNil
            )
        } else if (transport === MCPServerType.STDIO || (!transport && server.command)) {
            mcpStdioRuntimeManager.assertInitScriptsAllowed(server, name)
            // Starting event
            await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
                id: toolset.id,
                title: t('server-ai:Tools.MCP.Starting'),
                message: toolset.name,
                status: 'running',
                created_date: new Date().toISOString()
            } as TChatEventMessage)

            // Init scripts
            const initScripts = server.initScripts?.trim()
            if (initScripts) {
                await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
                    id: toolset.id,
                    title: t('server-ai:Sandbox.ExecScript', { part: 1, total: 1 })
                } as TChatEventMessage)
                const result = await runScript(initScripts, {
                    safeEnv: environment.production,
                    timeout: 1000 * 60 * 10
                })
                if (result.timedOut) {
                    logs.push(`Timeout executing init scripts after 10 mins.`)
                }
                if (result.stderr) logs.push(result.stderr)
                if (result.stdout) logs.push(result.stdout)

                await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
                    id: toolset.id,
                    title: t('server-ai:Sandbox.ExecScript', { part: 1, total: 1 }),
                    message: logs.join('\n')
                } as TChatEventMessage)
            }
            let args = null
            if (server.args?.length) {
                args = []
                for await (const value of server.args) {
                    args.push(await PromptTemplate.fromTemplate(value, { templateFormat: 'mustache' }).format(envState))
                }
            }
            let env = {}
            if (Object.keys(server.env ?? {}).length === 0) {
                env = null
            } else {
                for await (const name of Object.keys(server.env)) {
                    env[name] = await PromptTemplate.fromTemplate(server.env[name], {
                        templateFormat: 'mustache'
                    }).format(envState)
                }
            }
            const stdioServer: TMCPServer = {
                ...server,
                args,
                restart: server.reconnect
            } as TMCPServer
            if (env) {
                stdioServer.env = env
            }
            const managed = mcpStdioRuntimeManager.prepareServer(toolset, name, stdioServer, {
                ...runtimeContext,
                xpertId: runtimeContext.xpertId ?? xpertId
            })
            mcpServers[name] = {
                ...managed.server,
                restart: managed.server.reconnect
            }
            if (managed.runtime) {
                stdioRuntimes.push(managed.runtime)
            }
        }
    }

    installMcpUiClientCapabilitiesBridge()

    // Create a client
    const client = new MultiServerMCPClient({
        throwOnLoadError: true,
        prefixToolNameWithServerName: false,
        additionalToolNamePrefix: server.toolNamePrefix,
        outputHandling: {
            resource: 'artifact'
        },
        mcpServers
    })

    installMcpMetaArtifactBridge(client)
    installMcpToolAppMetadataBridge(client)
    try {
        await client.getTools()
        mcpStdioRuntimeManager.attachClient(client, stdioRuntimes)
    } catch (error) {
        mcpStdioRuntimeManager.failRuntimes(stdioRuntimes, error)
        await client.close().catch(() => undefined)
        throw error
    }
    // Ready event
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
        id: toolset.id,
        title: t('server-ai:Tools.MCP.Ready'),
        status: 'success',
        end_date: new Date().toISOString()
    } as TChatEventMessage)

    return {
        client,
        destroy: async () => {
            await mcpStdioRuntimeManager.closeClient(client)
        },
        logs
    }
}
