import { StructuredToolInterface } from '@langchain/core/tools'
import { I18nObject, IBuiltinTool, IXpertToolset, TranslateOptions, TToolsetParams } from '@metad/contracts'
import { environment } from '@metad/server-config'
import { RequestContext } from '@metad/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { _BaseToolset, toolNamePrefix } from '../../shared/'
import { Sandbox } from '../client'
import { SandboxLocal } from '../client-local'

export type TSandboxToolsetParams = TToolsetParams & {
	commandBus: CommandBus
	queryBus: QueryBus
}

export abstract class BaseSandboxToolset<
	T extends StructuredToolInterface = StructuredToolInterface
> extends _BaseToolset<T> {
	toolNamePrefix: string

	public sandbox: Sandbox

	get commandBus() {
		return this.params?.commandBus
	}
	get queryBus() {
		return this.params?.queryBus
	}
	get projectId() {
		return this.params?.projectId
	}
	get userId() {
		return this.params?.userId
	}

	constructor(
		public providerName: string,
		protected params?: TSandboxToolsetParams,
		protected toolset?: IXpertToolset
	) {
		super(params)
	}

	protected async _ensureSandbox() {
		if (!this.sandbox) {
			if (environment.pro) {
				//
			} else {
				this.sandbox = new SandboxLocal({
					sandboxUrl: null,
					commandBus: this.commandBus,
					tenantId: RequestContext.currentTenantId(),
					projectId: this.params.projectId,
					userId: this.params.userId,
					conversationId: this.params.conversationId
				})
			}
		}

		return this.sandbox
	}

	getId(): string {
		return this.toolset?.id
	}

	/**
	 * @todo Is a prefix required?
	 */
	getName(): string {
		return this.toolset?.name || toolNamePrefix(this.toolNamePrefix, this.providerName)
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
	translate(key: string, options?: TranslateOptions) {
		return t(key, {ns: 'server-ai', ...(options?.args ?? {})})
	}
}
