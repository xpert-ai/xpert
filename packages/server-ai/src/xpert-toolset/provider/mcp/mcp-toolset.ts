import { IXpertToolset, XpertToolsetCategoryEnum } from '@metad/contracts'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { BaseToolset } from '../../toolset'

export class MCPToolset extends BaseToolset {
	providerType = XpertToolsetCategoryEnum.MCP

	// MCP Client
	protected client = new MultiServerMCPClient()
	constructor(protected toolset?: IXpertToolset) {
		super(toolset)
	}

	async initTools() {
		const servers = JSON.parse(this.toolset.schema)
		// Connect to a remote server via SSE
		for await (const name of Object.keys(servers)) {
			const server = servers[name]
			await this.client.connectToServerViaSSE(
				name, // Server name
				server.url // SSE endpoint URL
			)
		}

		this.tools = this.client.getTools()
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
}
