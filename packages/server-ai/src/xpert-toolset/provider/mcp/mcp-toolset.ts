import { DynamicStructuredTool } from '@langchain/core/tools'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { I18nObject, IXpertToolset, XpertToolsetCategoryEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { TBuiltinToolsetParams } from '../builtin'
import { createProMCPClient } from './pro'
import { createMCPClient } from './types'
import { _BaseToolset } from '../../../shared'

export class MCPToolset extends _BaseToolset {
	providerName = 'mcp'
	providerType = XpertToolsetCategoryEnum.MCP

	readonly #logger = new Logger(MCPToolset.name)

	// MCP Client
	protected client: MultiServerMCPClient = null
	constructor(
		protected toolset: IXpertToolset,
		protected params?: TBuiltinToolsetParams
	) {
		super(params)
	}

	getId(): string {
		return this.toolset.id
	}
	getName(): string {
		return this.toolset.name
	}

	async initTools() {
		const { client } = this.params.toolsetService.isPro()
			? await createProMCPClient(
					this.toolset,
					this.params?.signal,
					this.params.commandBus,
					JSON.parse(this.toolset.schema),
					this.params.env
				)
			: await createMCPClient(this.toolset, JSON.parse(this.toolset.schema), this.params.env)
		this.client = client
		const tools = await this.client.getTools()
		const disableToolDefault = this.toolset.options?.disableToolDefault
		this.tools = tools.filter((tool) =>
			disableToolDefault ? this.toolset.tools.some((_) => _.name === tool.name && !_.disabled) : true
		)
		this.tools.forEach((tool) => (<DynamicStructuredTool>tool).verboseParsingErrors = true)
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

	/**
	 * @todo
	 */
	getToolTitle(name: string): string | I18nObject {
		const tool = this.toolset?.tools?.find((tool) => tool.name === name)
		const identity = tool?.schema?.entity
		if (identity) {
			return identity
		}
		return null
	}

	async close() {
		await this.client.close()
		this.#logger.debug(`closed mcp toolset '${this.toolset.name}'.`)
	}
}
