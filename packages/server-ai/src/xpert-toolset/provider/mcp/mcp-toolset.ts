import { IXpertToolset, XpertToolsetCategoryEnum } from '@metad/contracts'
import { BaseToolset } from '../../toolset'

export class MCPToolset extends BaseToolset {
	providerType = XpertToolsetCategoryEnum.MCP

	constructor(protected toolset?: IXpertToolset) {
		super(toolset)
	}

	async initTools() {
		return null
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
