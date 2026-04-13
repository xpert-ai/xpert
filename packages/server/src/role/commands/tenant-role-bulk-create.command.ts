import { ICommand } from '@nestjs/cqrs';
import { ITenant } from '@xpert-ai/contracts';

export class TenantRoleBulkCreateCommand implements ICommand {
	static readonly type = '[Role] Bulk Create';

	constructor(public readonly input: ITenant[]) {}
}
