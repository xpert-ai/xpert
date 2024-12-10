import { BaseToolkit, StructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import { IBuiltinTool, IXpertToolset, ToolProviderCredentials, XpertToolsetCategoryEnum } from '@metad/contracts'
import { IToolRuntime, ToolProviderIdentity } from './types'
import { ZodObjectAny } from '@langchain/core/dist/types/zod'
import { ZodEffects } from 'zod'

export abstract class BaseToolset<T extends StructuredToolInterface = StructuredToolInterface> extends BaseToolkit {
	abstract providerType: XpertToolsetCategoryEnum
	// For langchain
	tools: T[]

	identity?: ToolProviderIdentity
	credentialsSchema?: { [key: string]: ToolProviderCredentials }

	constructor(protected toolset?: IXpertToolset) {
		super()
	}

	async initTools() {
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

export abstract class BaseTool extends StructuredTool {
	schema: ZodObjectAny | ZodEffects<ZodObjectAny, any, { [x: string]: any }>
}
