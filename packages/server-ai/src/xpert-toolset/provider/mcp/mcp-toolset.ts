import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { IXpertToolset, XpertToolsetCategoryEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { BaseToolset } from '../../toolset'
import { createMCPClient } from './types'

export class MCPToolset extends BaseToolset {
	providerType = XpertToolsetCategoryEnum.MCP

	readonly #logger = new Logger(MCPToolset.name)

	// MCP Client
	protected client = new MultiServerMCPClient()
	constructor(protected toolset?: IXpertToolset) {
		super(toolset)
	}

	async initTools() {
		this.client = await createMCPClient(JSON.parse(this.toolset.schema))
		const tools = this.client.getTools()
		const disableToolDefault = this.toolset.options?.disableToolDefault
		this.tools = tools.filter((tool) =>
			disableToolDefault ? this.toolset.tools.some((_) => _.name === tool.name && !_.disabled) : true
		)
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
		await this.client.close()
		this.#logger.debug(`closed mcp toolset '${this.toolset.name}'.`)
	}
}
