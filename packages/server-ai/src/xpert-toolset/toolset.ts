import { BaseToolkit, StructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import {
	IBuiltinTool,
	IXpertToolset,
	ToolProviderCredentials,
	TStateVariable,
	XpertToolsetCategoryEnum
} from '@metad/contracts'
import { ZodObject, ZodEffects } from 'zod'
import { IToolRuntime, ToolProviderIdentity } from './types'

export abstract class BaseToolset<T extends StructuredToolInterface = StructuredToolInterface> extends BaseToolkit {
	abstract providerType: XpertToolsetCategoryEnum
	// For Langchain
	tools: T[]

	identity?: ToolProviderIdentity
	credentialsSchema?: { [key: string]: ToolProviderCredentials }
	// For Langgraph
	stateVariables: TStateVariable[]

	constructor(protected toolset?: IXpertToolset) {
		super()
	}

	/**
	 * Async init tools
	 * 
	 * @returns 
	 */
	async initTools() {
		return this.tools
	}

	/**
	 * Get one tool
	 * 
	 * @param toolName 
	 * @returns 
	 */
	getTool(toolName: string) {
		return this.getTools().find((tool) => tool.name === toolName)
	}

	/**
	 * Get credentials schema
	 * 
	 * @returns Credentials schema
	 */
	getCredentialsSchema(): { [key: string]: ToolProviderCredentials } {
		return { ...this.credentialsSchema }
	}

	/**
	 * Get toolset entity
	 * 
	 * @returns XpertToolset
	 */
	getToolset() {
		return this.toolset
	}

	/**
	 * Get state variables config
	 * 
	 * @returns State variables
	 */
	getVariables(): TStateVariable[] {
		return null
	}
}

export interface IBaseTool extends IBuiltinTool {
	runtime: IToolRuntime
}

export abstract class BaseTool extends StructuredTool {
	schema: ZodObject<any, any, any, any, { [x: string]: any }> | ZodEffects<ZodObject<any, any, any, any, { [x: string]: any }>, any, { [x: string]: any }>
}
