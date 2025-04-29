import { StructuredToolInterface } from '@langchain/core/tools'
import { TToolsetParams } from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { _BaseToolset } from './toolset'

export type TSandboxToolsetParams = TToolsetParams & {
	commandBus: CommandBus
	queryBus: QueryBus
}

export abstract class BaseSandboxToolset<
	T extends StructuredToolInterface = StructuredToolInterface
> extends _BaseToolset<T> {
	public sandboxUrl: string

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
		// pro
		return this.sandboxUrl
	}
}
