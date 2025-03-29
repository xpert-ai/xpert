import { IXpertToolset, XpertToolsetCategoryEnum } from '@metad/contracts'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { BaseToolset } from '../../toolset'
import { createMCPClient } from './types'

export class MCPToolset extends BaseToolset {
	providerType = XpertToolsetCategoryEnum.MCP

	// MCP Client
	protected client = new MultiServerMCPClient()
	constructor(protected toolset?: IXpertToolset) {
		super(toolset)
	}

	async initTools() {
		this.client = await createMCPClient({servers: JSON.parse(this.toolset.schema)})

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

	async close() {
		console.log(`close mcp toolset.`)
		await this.client.close()
	}
}
