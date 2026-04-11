import { IOrganizationUpdateInput } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class OrganizationUpdateCommand implements ICommand {
	static readonly type = '[Organization] Update';

	constructor(public readonly input: IOrganizationUpdateInput) {}
}
