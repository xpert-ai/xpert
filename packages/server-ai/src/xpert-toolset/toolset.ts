import { StructuredToolInterface } from '@langchain/core/tools'
import {
	IBuiltinTool,
	IXpertToolset,
	ToolProviderCredentials,
	XpertToolsetCategoryEnum
} from '@metad/contracts'

import { IToolRuntime, ToolProviderIdentity } from './types'
import { _BaseToolset } from '../shared/'



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
