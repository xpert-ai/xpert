import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { RunnableConfig } from '@langchain/core/runnables'
import { ToolParams } from '@langchain/core/tools'
import { IXpertTool, TXpertToolEntity } from '@metad/contracts'
import { BaseTool } from '../../toolset'
import { ApiBasedToolSchemaParser } from '../../utils/parser'
import { ToolParameterValidationError } from '../../errors'

export type TODataService = any

export class ODataTool extends BaseTool {
	public name: string
	public description: string

	constructor(
		protected xpertTool: IXpertTool,
		protected service?: TODataService,
		fields?: ToolParams
	) {
		super(fields)

		this.name = xpertTool.name
		this.description = xpertTool.description

		if (xpertTool.schema) {
			this.schema = ApiBasedToolSchemaParser.parseParametersToZod(
				xpertTool.schema.parameters ?? [] /* Default empty */,
				xpertTool.parameters
			) as unknown as typeof this.schema
		}
	}

	async validate_credentials(credentials: Record<string, any>, parameters: Record<string, any>, format_only = false) {
		if (format_only) {
			return ''
		}
	}

	protected async _call(
		toolParameters: any,
		runManager?: CallbackManagerForToolRun,
		parentConfig?: RunnableConfig
	): Promise<any> {
		await this.service.init
		const entitySet = this.service[this.xpertTool.schema.entity]
		if (!entitySet) {
			throw new ToolParameterValidationError(`Entity '${this.xpertTool.schema.entity}' not found`)
		}

		const schema = this.xpertTool.schema as TXpertToolEntity

		switch(schema.method) {
			case 'create':
				return await entitySet.post(toolParameters)
			case 'query':
				return await entitySet.get() // todo
			case 'get':
				return await entitySet.get(toolParameters)
			case 'delete':
				return await entitySet.delete(toolParameters)
			default:
				return await entitySet.get(toolParameters)
		}
	}
}
