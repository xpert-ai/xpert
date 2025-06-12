import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { RunnableConfig } from '@langchain/core/runnables'
import { ToolParams } from '@langchain/core/tools'
import { IBuiltinTool, IXpertTool, ToolParameterForm, TToolParameter } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { ApiBasedToolSchemaParser } from '../../utils/parser'
import { BuiltinToolset } from './builtin-toolset'
import { BaseTool } from '../../../shared'

/**
 * @deprecated
 */
export class BaseCommandTool extends BaseTool {
	
	public name: string
	public description: string
	public command: string

	get queryBus() {
		return this.toolset.queryBus
	}

	constructor(
		protected tool: IXpertTool,
		protected toolset: BuiltinToolset,
		fields?: ToolParams
	) {
		super(fields)

		this.name = tool.name
		this.description = tool.description
		const schema = this.tool.schema as IBuiltinTool
		this.command = schema.entity
		this.setSchema(this.tool)
	}

	setSchema(tool: IXpertTool) {
		// let zodSchema: z.AnyZodObject = null
		// Default empty
		const parameters =
			(<TToolParameter[]>tool.schema.parameters)?.filter((param) => param.form === ToolParameterForm.LLM) ?? []
		try {
			this.schema = ApiBasedToolSchemaParser.parseParametersToZod(parameters as any[])
			// zodSchema = eval(jsonSchemaToZod(tool.schema, { module: 'cjs' }))
		} catch (err) {
			throw new Error(`Invalid input schema for tool: ${tool.name}`)
		}
		// this.schema = zodSchema as unknown as typeof this.schema
	}

	getToolsetService() {
		return this.toolset.toolsetService
	}

	protected async _call(
		arg: any,
		runManager?: CallbackManagerForToolRun,
		parentConfig?: RunnableConfig
	): Promise<any> {
		const configurable = parentConfig.configurable ?? {}
		return await this.getToolsetService().executeCommand(
			this.command,
			{
				...arg
			},
			runManager,
			{
				...parentConfig,
				configurable: {
					...(parentConfig.configurable ?? {}),
					tenantId: configurable.tenantId ?? RequestContext.currentTenantId(),
					organizationId: configurable.organizationId ?? RequestContext.getOrganizationId()
				}
			}
		)
	}
}
