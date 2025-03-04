import { ICommand } from '@nestjs/cqrs';
import { IUserCreateInput } from '@metad/contracts';

/**
 * Bulk create users
 */
export class UserBulkCreateCommand implements ICommand {
	static readonly type = '[User] Bulk Register';

	constructor(public readonly input: IUserCreateInput[]) {}
}
