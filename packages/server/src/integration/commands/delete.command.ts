import { ICommand } from '@nestjs/cqrs';

export class IntegrationDelCommand implements ICommand {
	static readonly type = '[Integration] Delete';

	constructor(public readonly id: string) {}
}
