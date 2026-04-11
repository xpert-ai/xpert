import { IInviteAcceptInput, LanguagesEnum } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class InviteAcceptUserCommand implements ICommand {
	static readonly type = '[Invite] Accept User';

	constructor(
		public readonly input: IInviteAcceptInput,
		public readonly languageCode: LanguagesEnum
	) {}
}
