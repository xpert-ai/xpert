import { I18nObject, isEnableTool, IXpertTool, IXpertToolset, XpertToolsetCategoryEnum } from '@metad/contracts'
import { BaseToolset } from '../../toolset'
import { OpenAPITool } from './tools/openapi-tool'

export class OpenAPIToolset extends BaseToolset<OpenAPITool> {
	providerName = 'openapi'
	providerType = XpertToolsetCategoryEnum.API
	provider_id: string

	constructor(protected toolset?: IXpertToolset) {
		super(toolset)

		const tools: OpenAPITool[] = []
		this.toolset.tools?.filter((_) => isEnableTool(_, this.toolset)).forEach((item) => {
			// Provide specific tool name to tool class
			const DynamicOpenAPITool = class extends OpenAPITool {
				static lc_name(): string {
					return item.name
				} 
				constructor(tool: IXpertTool,) {
					super(tool)
				}
			}

			const tool = new DynamicOpenAPITool({
				...item,
				toolset: this.toolset
			})
		
			tools.push(tool)
		})

		this.tools = tools
	}

	// private _parse_tool_bundle(tool_bundle: ApiToolBundle): OpenAPITool {
	// 	// Todo
	// 	return new OpenAPITool({options: {api_bundle: tool_bundle}} as unknown as IXpertTool, {
	// 		identity: {
	// 			author: tool_bundle.author,
	// 			name: tool_bundle.operation_id,
	// 			label: { en_US: tool_bundle.operation_id, zh_Hans: tool_bundle.operation_id },
	// 			icon: this.identity.icon,
	// 			provider: this.provider_id
	// 		},
	// 		description: {
	// 			human: { en_US: tool_bundle.summary || '', zh_Hans: tool_bundle.summary || '' },
	// 			llm: tool_bundle.summary || ''
	// 		},
	// 		parameters: tool_bundle.parameters || [],
	// 		runtime: null
	// 	})
	// }

	// load_bundled_tools(tools: ApiToolBundle[]): OpenAPITool[] {
	// 	this.tools = tools.map((tool) => this._parse_tool_bundle(tool))
	// 	return this.tools
	// }

	getTools() {
		return this.tools
	}

	getTool(toolName: string): OpenAPITool {
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
}
