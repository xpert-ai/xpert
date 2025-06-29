import { IBuiltinTool, IXpertTool, XpertToolsetCategoryEnum } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { PaginationParams, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { JSONSchemaFaker, Schema } from 'json-schema-faker'
import { uniq } from 'lodash'
import { Repository } from 'typeorm'
import { _BaseToolset, ToolSchemaParser } from '../shared'
import { ListBuiltinToolsQuery, ToolsetGetToolsCommand, XpertToolsetService } from '../xpert-toolset'
import { ToolInvokeCommand } from './commands'
import { XpertTool } from './xpert-tool.entity'

@Injectable()
export class XpertToolService extends TenantOrganizationAwareCrudService<XpertTool> {
	readonly #logger = new Logger(XpertToolService.name)

	constructor(
		@InjectRepository(XpertTool)
		repository: Repository<XpertTool>,
		private readonly toolsetService: XpertToolsetService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async getTool(id: string, options?: Partial<PaginationParams<XpertTool>>) {
		let { relations } = options ?? {}
		relations ??= []
		relations.push('toolset')

		const tool = await this.findOne(id, { relations: uniq(relations) })

		if (tool.toolset.category === XpertToolsetCategoryEnum.BUILTIN) {
			const toolDetails = await this.queryBus.execute<ListBuiltinToolsQuery, IBuiltinTool[]>(
				new ListBuiltinToolsQuery(tool.toolset.type, [tool.name])
			)
			tool.provider = toolDetails[0]
		}

		return tool
	}

	async testTool(tool: Partial<IXpertTool>) {
		let toolset = null
		if (tool.toolsetId) {
			toolset = await this.toolsetService.findOne(tool.toolsetId)
		}
		let toolDetail = null
		if (tool.id) {
			toolDetail = await this.findOne(tool.id)
		}

		return await this.commandBus.execute(
			new ToolInvokeCommand({
				...(toolDetail ?? {}),
				...omit(tool, 'toolset'),
				toolset: toolset ?? tool.toolset
			})
		)
	}

	async getParamsFaker(id: string) {
		const tool = await this.getTool(id, { relations: ['toolset'] })
		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, _BaseToolset[]>(
			new ToolsetGetToolsCommand([tool.toolsetId])
		)
		const toolset = toolsets[0]
		await toolset.initTools()
		const toolInstance = toolset.getTool(tool.name)
		const jsonSchema = ToolSchemaParser.parseZodToJsonSchema(toolInstance.schema)
		const sample = JSONSchemaFaker.generate(jsonSchema as Schema)
		return sample
	}
}
