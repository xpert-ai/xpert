import { StructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import {
	IBuiltinTool,
	IXpertToolset,
	ToolProviderCredentials,
	XpertToolsetCategoryEnum
} from '@metad/contracts'
import { z, ZodEffects, ZodObject } from 'zod'
import { IToolRuntime, ToolProviderIdentity } from './types'
import { _BaseToolset } from '../shared/'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodObjectAny = z.ZodObject<any, any, any, any>;

/**
 * @deprecated use `_BaseToolset`. Use `BuiltinToolset` `MCPToolset` `OpenAPIToolset` for sub toolset.
 */
export abstract class BaseToolset<T extends StructuredToolInterface = StructuredToolInterface> extends _BaseToolset<T> {
	abstract providerType: XpertToolsetCategoryEnum

	identity?: ToolProviderIdentity
	credentialsSchema?: { [key: string]: ToolProviderCredentials }

	constructor(protected toolset?: IXpertToolset) {
		super()
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

	getName() {
		return this.getToolset()?.name
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
