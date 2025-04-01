import { BaseToolkit, StructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import {
	IBuiltinTool,
	IXpertToolset,
	ToolProviderCredentials,
	TStateVariable,
	XpertToolsetCategoryEnum
} from '@metad/contracts'
import { z, ZodEffects, ZodObject } from 'zod'
import { IToolRuntime, ToolProviderIdentity } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodObjectAny = z.ZodObject<any, any, any, any>;

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
	async getVariables(): Promise<TStateVariable[]> {
		return null
	}

	/**
     * Close all (connections).
     */
    async close(): Promise<void> {
		//
	}
}

export interface IBaseTool extends IBuiltinTool {
	runtime: IToolRuntime
}

export abstract class BaseTool<T extends ZodObjectAny = ZodObjectAny> extends StructuredTool {
	schema:
		| ZodObject<any, any, any, any, { [x: string]: any }>
		| ZodEffects<ZodObject<any, any, any, any, { [x: string]: any }>, any, { [x: string]: any }> = z
		.object({ input: z.string().optional() })
		.transform((obj) => obj.input)
}
