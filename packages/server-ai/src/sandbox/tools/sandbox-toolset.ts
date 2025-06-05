import { StructuredToolInterface } from '@langchain/core/tools'
import { TToolsetParams } from '@metad/contracts'
import { environment } from '@metad/server-config'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { _BaseToolset } from '../../shared/'
import { MockSandbox, Sandbox } from '../client'
import { SandboxLoadCommand } from '../commands'

export type TSandboxToolsetParams = TToolsetParams & {
	commandBus: CommandBus
	queryBus: QueryBus
}

export abstract class BaseSandboxToolset<
	T extends StructuredToolInterface = StructuredToolInterface
> extends _BaseToolset<T> {
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

	constructor(protected params?: TSandboxToolsetParams) {
		super(params)
	}

	protected async _ensureSandbox() {
		if (!this.sandbox) {
			if (environment.pro) {
				const { sandboxUrl } = await this.commandBus.execute<SandboxLoadCommand, { sandboxUrl: string }>(
					new SandboxLoadCommand()
				)
				this.sandbox = new Sandbox(sandboxUrl)
			} else {
				this.sandbox = new MockSandbox('')
			}
		}

		return this.sandbox
	}
}
