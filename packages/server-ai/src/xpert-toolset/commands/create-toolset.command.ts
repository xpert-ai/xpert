import { IXpertToolset } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'

/**
 * Create toolset's instance for given toolset.
 */
export class CreateToolsetCommand implements ICommand {
	static readonly type = '[Xpert Toolset] Get tools'

	constructor(
		public readonly toolset: IXpertToolset,
		public readonly params?: TBuiltinToolsetParams
	) {}
}
