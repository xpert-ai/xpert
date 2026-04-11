import { ICommand } from '@nestjs/cqrs';
import { IUserRegistrationInput, LanguagesEnum } from '@xpert-ai/contracts';

export class AuthRegisterCommand implements ICommand {
	static readonly type = '[Auth] Register';

	constructor(
		public readonly input: IUserRegistrationInput,
		public readonly languageCode: LanguagesEnum
	) {}
}
