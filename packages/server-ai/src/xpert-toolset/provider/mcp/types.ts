import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { MCPServerType, TMCPSchema } from '@metad/contracts'

export async function createMCPClient(id: string, schema: TMCPSchema) {
	// Create a client
	const client = new MultiServerMCPClient()

	const servers = schema.servers ?? schema.mcpServers
	// Connect to a remote server via SSE
	for await (const name of Object.keys(servers)) {
		const server = servers[name]
		const transport = server.type?.toLowerCase()
		if (transport === MCPServerType.SSE || (!transport && server.url)) {
			await client.connectToServerViaSSE(
				name, // Server name
				server.url, // SSE endpoint URL
				server.headers,
				server.useNodeEventSource,
				server.reconnect
			)
		} else if (transport === MCPServerType.STDIO || (!transport && server.command)) {
			await client.connectToServerViaStdio(
				name, // Server name
				server.command,
				server.args,
				server.env,
				server.restart
			)
		}
	}

    return {client}
}
