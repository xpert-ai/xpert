import { ICommand } from '@nestjs/cqrs';
import { IUserLoginInput } from '@xpert-ai/contracts';

export class AuthLoginCommand implements ICommand {
	static readonly type = '[Auth] Login';

	constructor(public readonly input: IUserLoginInput) {}
}
