import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { MCPServerType, TMCPSchema } from '@metad/contracts'

export async function createMCPClient(id: string, schema: TMCPSchema) {

	const mcpServers = {}
	let server = null
	const servers = schema.servers ?? schema.mcpServers
	// Connect to a remote server via SSE
	for await (const name of Object.keys(servers)) {
		server = servers[name]
		const transport = server.type?.toLowerCase()
		if (transport === MCPServerType.SSE || (!transport && server.url)) {
			mcpServers[name] = {
				...server,
				useNodeEventSource: true,
			}
			
		} else if (transport === MCPServerType.STDIO || (!transport && server.command)) {
			const args = server.args?.map((_) => _.split(' ').filter((_) => !!_)).flat()
			let env = server.env
			if (Object.keys(env ?? {}).length === 0) {
				env = null
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

    return {client, destroy: null}
}
