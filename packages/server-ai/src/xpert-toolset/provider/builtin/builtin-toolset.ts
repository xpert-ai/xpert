import { IXpertToolset, TToolCredentials, XpertToolsetCategoryEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { BaseToolset } from '../../toolset'
import { BuiltinTool } from './builtin-tool'
import { XpertToolsetService } from '../../xpert-toolset.service'

export type TBuiltinToolsetParams = {
	tenantId: string
    organizationId?: string
	toolsetService: XpertToolsetService
	commandBus: CommandBus
	queryBus: QueryBus
}

export type TranslateOptions = {
	lang?: string;
    args?: ({
        [k: string]: any;
    } | string)[] | {
        [k: string]: any;
    };
    debug?: boolean;
}

export abstract class BuiltinToolset extends BaseToolset<BuiltinTool> {
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

	constructor(
		public provider: string,
		protected toolset?: IXpertToolset,
		protected params?: TBuiltinToolsetParams
	) {
		super(toolset)
	}

	async validateCredentials(credentials: TToolCredentials) {
		return await this._validateCredentials(credentials)
	}

	abstract _validateCredentials(credentials: TToolCredentials): Promise<void>

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
