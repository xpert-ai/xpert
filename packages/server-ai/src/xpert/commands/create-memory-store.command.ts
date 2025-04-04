import { IXpert } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Create memory store
 */
export class CreateMemoryStoreCommand implements ICommand {
	static readonly type = '[Xpert] Create memory store'

	constructor(
		public readonly xpert: Partial<IXpert>,
		public readonly userId: string
	) {}
}
