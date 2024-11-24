import { BaseToolkit, StructuredToolInterface, Tool } from '@langchain/core/tools'
import { IBuiltinTool, IXpertToolset, ToolProviderCredentials, XpertToolsetCategoryEnum } from '@metad/contracts'
import { IToolRuntime, ToolProviderIdentity } from './types'

export abstract class BaseToolset<T extends StructuredToolInterface = Tool> extends BaseToolkit {
	abstract providerType: XpertToolsetCategoryEnum
	// For langchain
	tools: T[]

	identity?: ToolProviderIdentity
	credentialsSchema?: { [key: string]: ToolProviderCredentials }

	constructor(protected toolset?: IXpertToolset) {
		super()
	}

	getTools() {
		return this.tools
	}

	getTool(toolName: string) {
		return this.getTools().find((tool) => tool.name === toolName)
	}

	getCredentialsSchema(): { [key: string]: ToolProviderCredentials } {
		return { ...this.credentialsSchema }
	}
}

export interface IBaseTool extends IBuiltinTool {
	runtime: IToolRuntime
}

export abstract class BaseTool extends Tool {
	name: string
	description: string
}
