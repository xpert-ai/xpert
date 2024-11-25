import { XpertToolsetCategoryEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { isNil } from 'lodash'
import { Subject } from 'rxjs'
import {
	ApiBasedToolSchemaParser,
	createBuiltinToolset,
	ODataToolset,
	OpenAPIToolset,
	ToolNotSupportedError,
	XpertToolsetService
} from '../../../xpert-toolset'
import { ToolInvokeCommand } from '../tool-invoke.command'

@CommandHandler(ToolInvokeCommand)
export class ToolInvokeHandler implements ICommandHandler<ToolInvokeCommand> {
	readonly #logger = new Logger(ToolInvokeHandler.name)

	constructor(
		private readonly toolsetService: XpertToolsetService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ToolInvokeCommand): Promise<any> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		// Default enabled tool for invoke
		const tool = { ...command.tool, enabled: true }
		const toolset = tool.toolset

		// Parse parameters types
		const parameters = tool.schema.parameters?.reduce((acc, param) => {
			if (!isNil(tool.parameters[param.name])) {
				acc[param.name] = ApiBasedToolSchemaParser.convertPropertyValueType(
					param.schema,
					tool.parameters[param.name]
				)
			}
			return acc
		}, {})

		const events = []
		const subscriber = new Subject()

		subscriber.subscribe((event) => events.push(event))

		const toolContext = {
			tenantId,
			organizationId,
			user: RequestContext.currentUser(),
			userId: RequestContext.currentUserId(),
			subscriber
		}

		switch (toolset.category) {
			case XpertToolsetCategoryEnum.BUILTIN: {
				const builtinToolset = createBuiltinToolset(
					toolset.type,
					{
						...toolset,
						tools: [
							{
								...tool,
								enabled: true
							}
						]
					},
					{
						tenantId,
						organizationId,
						toolsetService: this.toolsetService,
						commandBus: this.commandBus,
						queryBus: this.queryBus
					}
				)

				// const parameterNames = (<TToolParameter[]>tool.schema.parameters)
				// 	.filter((param) => param.form === ToolParameterForm.LLM)
				// 	.map((param) => param.name)

				await builtinToolset.initTools()

				const result = await builtinToolset.getTool(tool.name).invoke(parameters ?? {}, {
					configurable: toolContext
				})

				if (events.length) {
					return {
						events,
						result
					}
				}
				return result
			}
			case XpertToolsetCategoryEnum.API: {
				switch (toolset.type) {
					case 'openapi': {
						const openapiToolset = new OpenAPIToolset({ ...toolset, tools: [tool] })
						const toolRuntime = openapiToolset.getTool(tool.name)
						return await toolRuntime.invoke(parameters, {
							configurable: toolContext
						})
					}

					case 'odata': {
						const openapiToolset = new ODataToolset({ ...toolset, tools: [tool] })
						const toolRuntime = openapiToolset.getTool(tool.name)
						return await toolRuntime.invoke(parameters, {
							configurable: toolContext
						})
					}
				}
				break
			}
		}

		throw new ToolNotSupportedError(`Toolset type ${toolset.type}`)
	}
}
