import { IIntegration } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs';

export class IntegrationUpsertCommand implements ICommand {
	static readonly type = '[Integration] Upsert';

	constructor(public readonly input: Partial<IIntegration>) {}
}
