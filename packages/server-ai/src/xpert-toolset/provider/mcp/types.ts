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
} from '@metad/contracts'
import { t } from 'i18next'
import { isNil, omitBy } from 'lodash'

export async function createMCPClient(
	toolset: Partial<IXpertToolset>,
	schema: TMCPSchema,
	envState: Record<string, unknown>
) {
	const mcpServers = {}
	let server: TMCPServer = null
	const servers = schema.servers ?? schema.mcpServers
	// Connect to a remote server via SSE
	for await (const serverName of Object.keys(servers)) {
		server = servers[serverName]
		const name = serverName || toolset.name || 'default'
		const transport = server.type?.toLowerCase()
		if (transport === MCPServerType.SSE || (!transport && server.url)) {
			const headers = server.headers ?? {}
			for await (const name of Object.keys(headers)) {
				headers[name] = await PromptTemplate.fromTemplate(headers[name], {
					templateFormat: 'mustache'
				}).format(envState)
			}
			mcpServers[name] = omitBy(
				{
					...server,
					headers,
					useNodeEventSource: true
				},
				isNil
			)
		} else if (transport === MCPServerType.STDIO || (!transport && server.command)) {
			// Starting event
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: toolset.id,
				title: t('server-ai:Tools.MCP.Starting'),
				message: toolset.name,
				status: 'running',
				created_date: new Date().toISOString()
			} as TChatEventMessage)
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
			mcpServers[name] = {
				...server,
				args,
				restart: server.reconnect
			}
			if (env) {
				mcpServers[name].env = env
			}
		}
	}

	// Create a client
	const client = new MultiServerMCPClient({
		throwOnLoadError: true,
		prefixToolNameWithServerName: false,
		additionalToolNamePrefix: server.toolNamePrefix,
		mcpServers
	})

	await client.getTools()
	// Ready event
	await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
		id: toolset.id,
		title: t('server-ai:Tools.MCP.Ready'),
		status: 'success',
		end_date: new Date().toISOString()
	} as TChatEventMessage)

	return { client, destroy: null }
}
