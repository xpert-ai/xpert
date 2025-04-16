import { PromptTemplate } from '@langchain/core/prompts'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { MCPServerType, TMCPSchema, TMCPServer } from '@metad/contracts'

export async function createMCPClient(id: string, schema: TMCPSchema, envState: Record<string, unknown>) {
	const mcpServers = {}
	let server: TMCPServer = null
	const servers = schema.servers ?? schema.mcpServers
	// Connect to a remote server via SSE
	for await (const name of Object.keys(servers)) {
		server = servers[name]
		const transport = server.type?.toLowerCase()
		if (transport === MCPServerType.SSE || (!transport && server.url)) {
			let headers = server.headers
			if (Object.keys(server.env ?? {}).length === 0) {
				headers = null
			} else {
				for await (const name of Object.keys(headers)) {
					headers[name] = await PromptTemplate.fromTemplate(headers[name], {
						templateFormat: 'mustache'
					}).format(envState)
				}
			}
			mcpServers[name] = {
				...server,
				headers,
				useNodeEventSource: true
			}
		} else if (transport === MCPServerType.STDIO || (!transport && server.command)) {
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

	return { client, destroy: null }
}
