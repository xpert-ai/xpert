import { ICommand } from '@nestjs/cqrs';
import { IBusinessAreaUserDeleteInput } from '@xpert-ai/contracts';

export class BusinessAreaUserDeleteCommand implements ICommand {
	static readonly type = '[Business Area User] Delete';

	constructor(public readonly input: IBusinessAreaUserDeleteInput) {}
}
