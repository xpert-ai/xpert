import { IBuiltinTool } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { loadYamlFile } from '@metad/server-core'
import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import * as fs from 'fs'
import * as path from 'path'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { ListBuiltinToolsQuery } from '../list-builtin-tools.query'
import { getBuiltinToolsetBaseUrl } from '../../provider/builtin'

@QueryHandler(ListBuiltinToolsQuery)
export class ListBuiltinToolsHandler implements IQueryHandler<ListBuiltinToolsQuery> {
	protected logger = new Logger(ListBuiltinToolsHandler.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	private readonly _builtinTools = new Map<string, IBuiltinTool[]>()

	constructor(private readonly service: XpertToolsetService) {}

	public async execute(command: ListBuiltinToolsQuery): Promise<IBuiltinTool[]> {
		const { provider, names } = command

		const tools = await this.getBuiltinTools(provider)

		return tools.filter((tool) =>
			names ? names.includes(tool.identity.name) : true
		)
	}

	private async getBuiltinTools(provider: string): Promise<IBuiltinTool[]> {
		if (this._builtinTools.get(provider)) {
			return this._builtinTools.get(provider)
		}

		const toolPath = path.join(this.getProviderServerPath(provider), 'tools')
		const toolFiles = fs.readdirSync(toolPath).filter((file) => file.endsWith('.yaml') && !file.startsWith('__'))
		const tools: IBuiltinTool[] = []

		for (const toolFile of toolFiles) {
			// const toolName = toolFile.split(".")[0];
			const tool: IBuiltinTool = await loadYamlFile(path.join(toolPath, toolFile), this.logger)

			tool.identity.provider = provider
			tools.push(tool)
		}

		this._builtinTools.set(provider, tools)
		return tools
	}

	getProviderServerPath(name: string) {
		return path.join(this.configService.assetOptions.serverRoot, getBuiltinToolsetBaseUrl(name), name)
	}
}
