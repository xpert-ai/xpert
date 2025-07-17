import { BaseStore } from '@langchain/langgraph'
import { I18nObject, IBuiltinTool, IXpertToolset, TranslateOptions, TToolCredentials, TToolsetParams, XpertToolsetCategoryEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { BaseToolset } from '../../toolset'
import { BuiltinTool } from './builtin-tool'
import { XpertToolsetService } from '../../xpert-toolset.service'

/**
 * The context params of creating toolset
 */
export type TBuiltinToolsetParams = TToolsetParams & {
	toolsetService?: XpertToolsetService
	commandBus: CommandBus
	queryBus: QueryBus
	store?: BaseStore
}

export interface IBuiltinToolset {
	validateCredentials(credentials: TToolCredentials): Promise<void>
}

export abstract class BuiltinToolset extends BaseToolset<BuiltinTool> implements IBuiltinToolset {
	static provider = ''
	protected logger = new Logger(this.constructor.name)

	providerType: XpertToolsetCategoryEnum.BUILTIN

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

	get toolsetService() {
		return this.params?.toolsetService
	}
	get xpertId() {
		return this.params?.xpertId
	}

	constructor(
		public providerName: string,
		protected toolset?: IXpertToolset,
		protected params?: TBuiltinToolsetParams
	) {
		super(toolset)
	}

	async validateCredentials(credentials: TToolCredentials) {
		return await this._validateCredentials(credentials)
	}

	abstract _validateCredentials(credentials: TToolCredentials): Promise<void>

	getId() {
		return this.toolset?.id
	}

	getCredentials() {
		return this.toolset?.credentials
	}

	getToolTitle(name: string): string | I18nObject {
		const tool = this.toolset?.tools?.find((tool) => tool.name === name)
		const identity = (<IBuiltinTool>tool?.schema)?.identity;
		if (identity) {
			return identity.label
		}
		return null
	}

	/**
	 * Translate language text
	 * 
	 * @param key 
	 * @param options 
	 * @returns 
	 */
	async translate(key: string, options?: TranslateOptions) {
		return await this.toolsetService.translate(key, options)
	}
}
