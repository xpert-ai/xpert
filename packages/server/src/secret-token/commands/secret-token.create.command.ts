import { ISecretToken } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class SecretTokenCreateCommand implements ICommand {
	static readonly type = '[Secret Token] Create';

	constructor(
		public readonly input: ISecretToken
	) {}
}
