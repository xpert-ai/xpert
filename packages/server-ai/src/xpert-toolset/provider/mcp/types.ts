import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { MCPServerTransport, TMCPSchema } from '@metad/contracts'

export async function createMCPClient(schema: TMCPSchema) {
	// Create a client
	const client = new MultiServerMCPClient()

	// Connect to a remote server via SSE
	for await (const name of Object.keys(schema.servers)) {
		const server = schema.servers[name]
		const transport = server.transport?.toLowerCase()
		if (transport === MCPServerTransport.SSE || (!transport && server.url)) {
			await client.connectToServerViaSSE(
				name, // Server name
				server.url, // SSE endpoint URL
				server.headers,
				server.useNodeEventSource,
				server.reconnect
			)
		} else if (transport === MCPServerTransport.STDIO || (!transport && server.command)) {
			await client.connectToServerViaStdio(
				name, // Server name
				server.command,
				server.args,
				server.env,
				server.restart
			)
		}
	}

    return client
}
