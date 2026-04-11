import { ICommand } from '@nestjs/cqrs';
import { IUserCreateInput } from '@xpert-ai/contracts';

/**
 * EmailVerified automatically
 */
export class UserCreateCommand implements ICommand {
	static readonly type = '[User] Register';

	constructor(public readonly input: IUserCreateInput) {}
}
