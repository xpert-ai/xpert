import { StructuredToolInterface } from '@langchain/core/tools'
import { BaseStore } from '@langchain/langgraph'
import {
	I18nObject,
	IBuiltinTool,
	IXpertToolset,
	ToolProviderCredentials,
	TToolCredentials,
	TToolsetParams,
	XpertToolsetCategoryEnum
} from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { _BaseToolset } from './toolset'

/**
 * The context params of creating toolset
 */
export type TBuiltinToolsetParams = TToolsetParams & {
	commandBus: CommandBus
	queryBus: QueryBus
	store?: BaseStore
}

export interface IBuiltinToolset {
	validateCredentials(credentials: TToolCredentials): Promise<void>
}

export abstract class BuiltinToolset<T extends StructuredToolInterface = StructuredToolInterface, C = TToolCredentials>
	extends _BaseToolset<T>
	implements IBuiltinToolset
{
	static provider = ''
	protected logger = new Logger(this.constructor.name)

	providerType: XpertToolsetCategoryEnum.BUILTIN

	credentialsSchema?: { [key: string]: ToolProviderCredentials }

	get tenantId() {
		return this.params?.tenantId
	}
	get organizationId() {
		return this.params?.organizationId
	}
	get commandBus() {
		return this.params?.commandBus
	}
	get queryBus() {
		return this.params?.queryBus
	}

	get xpertId() {
		return this.params?.xpertId
	}

	constructor(
		public providerName: string,
		protected toolset?: IXpertToolset,
		protected params?: TBuiltinToolsetParams
	) {
		super(params)
	}

	validateCredentials(credentials: C): Promise<void> {
		throw new Error('Method not implemented.')
	}

	getId() {
		return this.toolset?.id
	}

	getCredentials() {
		return this.toolset?.credentials as C
	}

	getToolTitle(name: string): string | I18nObject {
		const tool = this.toolset?.tools?.find((tool) => tool.name === name)
		const identity = (<IBuiltinTool>tool?.schema)?.identity
		if (identity) {
			return identity.label
		}
		return null
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
