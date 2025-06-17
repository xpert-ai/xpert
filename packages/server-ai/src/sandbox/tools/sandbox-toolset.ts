import { StructuredToolInterface } from '@langchain/core/tools'
import { I18nObject, IBuiltinTool, IXpertToolset, TranslateOptions, TToolsetParams } from '@metad/contracts'
import { environment } from '@metad/server-config'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { _BaseToolset } from '../../shared/'
import { MockSandbox, Sandbox } from '../client'
import { t } from 'i18next'
import { SandboxLoadCommand } from '../commands'

export type TSandboxToolsetParams = TToolsetParams & {
	commandBus: CommandBus
	queryBus: QueryBus
}

export abstract class BaseSandboxToolset<
	T extends StructuredToolInterface = StructuredToolInterface
> extends _BaseToolset<T> {
	toolNamePrefix: string

	/**
	 * @deprecated use sandbox: Sandbox
	 */
	protected sandboxUrl: string
	public sandbox: Sandbox

	get commandBus() {
		return this.params?.commandBus
	}
	get queryBus() {
		return this.params?.queryBus
	}

	constructor(protected params?: TSandboxToolsetParams, protected toolset?: IXpertToolset) {
		super(params)
	}

	protected async _ensureSandbox() {
		if (!this.sandbox) {
			if (environment.pro) {
				const { sandboxUrl } = await this.commandBus.execute<SandboxLoadCommand, { sandboxUrl: string }>(
					new SandboxLoadCommand()
				)
				this.sandbox = new Sandbox({sandboxUrl, commandBus: this.commandBus})
			} else {
				this.sandbox = new MockSandbox({sandboxUrl: '', commandBus: this.commandBus})
			}
		}

		return this.sandbox
	}

	getName() {
		return this.toolset?.name
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
