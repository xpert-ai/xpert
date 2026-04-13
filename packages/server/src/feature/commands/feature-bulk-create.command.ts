import { ICommand } from '@nestjs/cqrs';
import { ITenant } from '@xpert-ai/contracts';

export class FeatureBulkCreateCommand implements ICommand {
	static readonly type = '[Feature] Bulk Create';

	constructor(public readonly tenants?: ITenant[]) {}
}
