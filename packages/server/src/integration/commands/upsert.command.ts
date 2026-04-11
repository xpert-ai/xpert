import { IIntegration } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class IntegrationUpsertCommand implements ICommand {
	static readonly type = '[Integration] Upsert';

	constructor(public readonly input: Partial<IIntegration>) {}
}
