import { IBuiltinTool } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { loadYamlFile } from '@metad/server-core'
import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import * as fs from 'fs'
import * as path from 'path'
import { getPositionMap } from '../../../core/utils'
import { getBuiltinToolsetBaseUrl } from '../../provider/builtin'
import { ListBuiltinToolsQuery } from '../list-builtin-tools.query'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import zodToJsonSchema from 'zod-to-json-schema'

@QueryHandler(ListBuiltinToolsQuery)
export class ListBuiltinToolsHandler implements IQueryHandler<ListBuiltinToolsQuery> {
	protected logger = new Logger(ListBuiltinToolsHandler.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	private readonly _builtinTools = new Map<string, IBuiltinTool[]>()

	constructor(private readonly toolsetRegistry: ToolsetRegistry) {}

	public async execute(command: ListBuiltinToolsQuery): Promise<IBuiltinTool[]> {
		const { provider, names } = command

		const tools = await this.getBuiltinTools(provider)

		return tools.filter((tool) => (names ? names.includes(tool.identity.name) : true))
	}

	private async getBuiltinTools(provider: string): Promise<IBuiltinTool[]> {
		if (this._builtinTools.get(provider)) {
			return this._builtinTools.get(provider)
		}

		try {
			const pluginProvider = this.toolsetRegistry.get(provider)
			if (pluginProvider) {
				const tools = pluginProvider.createTools()
				const builtinTools = tools.map((tool) => ({
					identity: {
						provider,
						name: tool.name,
						author: '',
						label: {
							en_US: tool.name,
							zh_Hans: tool.name
						}
					},
					description: {
							human: {
								en_US: tool.description,
							},
							llm: tool.description
						},
					schema: zodToJsonSchema(tool.schema)
				}))

				return builtinTools
			}
		} catch (error) {
			//
		}

		const providerPath = this.getProviderServerPath(provider)
		const toolPath = path.join(providerPath, 'tools')
		const toolFiles = fs.readdirSync(toolPath).filter((file) => (file.endsWith('.yaml') || file.endsWith('.yml')) && !file.startsWith('__'))

		const positionMap = getPositionMap(providerPath)

		let tools: IBuiltinTool[] = []

		for (const toolFile of toolFiles) {
			// const toolName = toolFile.split(".")[0];
			const tool: IBuiltinTool = await loadYamlFile(path.join(toolPath, toolFile), this.logger)

			tool.identity.provider = provider
			tools.push(tool)
		}

		tools = tools.sort((a, b) => (positionMap[a.identity.name] ?? 999) - (positionMap[b.identity.name] ?? 999))

		this._builtinTools.set(provider, tools)
		return tools
	}

	getProviderServerPath(name: string) {
		return path.join(this.configService.assetOptions.serverRoot, getBuiltinToolsetBaseUrl(name), name)
	}
}
