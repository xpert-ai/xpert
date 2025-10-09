import { Tool } from '@langchain/core/tools'
import { XpertToolsetCategoryEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { In } from 'typeorm'
import { ToolProviderNotFoundError } from '../../errors'
import { createBuiltinToolset, MCPToolset, ODataToolset } from '../../provider'
import { OpenAPIToolset } from '../../provider/openapi/openapi-toolset'
import { BaseToolset } from '../../toolset'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { ToolsetGetToolsCommand } from '../get-tools.command'
import { TBuiltinToolsetParams } from '../../../shared'

@CommandHandler(ToolsetGetToolsCommand)
export class ToolsetGetToolsHandler implements ICommandHandler<ToolsetGetToolsCommand> {
	readonly #logger = new Logger(ToolsetGetToolsHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly toolsetService: XpertToolsetService
	) {}

	public async execute(command: ToolsetGetToolsCommand): Promise<BaseToolset<Tool>[]> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const ids = command.ids
		if (!ids) {
			return []
		}
		const { items: toolsets } = await this.toolsetService.findAll({
			where: {
				id: In(ids)
			},
			relations: ['tools']
		})

		const context: TBuiltinToolsetParams = {
			conversationId: command.environment?.conversationId,
			tenantId,
			organizationId,
			// toolsetService: this.toolsetService,
			commandBus: this.commandBus,
			queryBus: this.queryBus,
			userId: RequestContext.currentUserId(),
			projectId: command.environment?.projectId,
			xpertId: command.environment?.xpertId,
			agentKey: command.environment?.agentKey,
			signal: command.environment?.signal,
			env: command.environment?.env,
			store: command.environment?.store
		}

		return Promise.all(toolsets.map(async (toolset) => {
			switch (toolset.category) {
				case XpertToolsetCategoryEnum.BUILTIN: {
					return await createBuiltinToolset(toolset.type, toolset, context)
				}
				case XpertToolsetCategoryEnum.API: {
					switch (toolset.type) {
						case 'openapi': {
							return new OpenAPIToolset(toolset)
						}
						case 'odata': {
							return new ODataToolset(toolset)
						}
						default: {
							throw new ToolProviderNotFoundError(`API Tool type '${toolset.type}' not found`)
						}
					}
				}
				case XpertToolsetCategoryEnum.MCP: {
					return new MCPToolset(toolset, context)
				}
				default: {
					throw new ToolProviderNotFoundError(`Tool category '${toolset.category}' not found`)
				}
			}
		}))
	}
}
