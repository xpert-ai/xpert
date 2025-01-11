import { BusinessAreaRole, IUser } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class BusinessAreaMyCommand implements ICommand {
	static readonly type = '[Business Area] My'

	constructor(
		public readonly input: IUser,
		public readonly role?: BusinessAreaRole
	) {}
}
