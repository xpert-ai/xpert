import { Tool } from '@langchain/core/tools'
import { XpertToolsetCategoryEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { In } from 'typeorm'
import { createBuiltinToolset, ODataToolset } from '../../provider'
import { OpenAPIToolset } from '../../provider/openapi/openapi-toolset'
import { BaseToolset } from '../../toolset'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { ToolsetGetToolsCommand } from '../get-tools.command'
import { ToolProviderNotFoundError } from '../../errors'
import { RequestContext } from '@metad/server-core'

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
		const { items: toolsets } = await this.toolsetService.findAll({
			where: {
				id: In(ids)
			},
			relations: ['tools']
		})

		return toolsets.map((toolset) => {
			switch (toolset.category) {
				case XpertToolsetCategoryEnum.BUILTIN: {
					return createBuiltinToolset(toolset.type, toolset, {
						tenantId,
						organizationId,
						toolsetService: this.toolsetService,
						commandBus: this.commandBus,
						queryBus: this.queryBus
					})
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
				default: {
					throw new ToolProviderNotFoundError(`Tool category '${toolset.category}' not found`)
				}
			}
		})
	}
}
