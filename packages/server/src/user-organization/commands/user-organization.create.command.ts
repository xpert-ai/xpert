import { IUser } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs';

export class UserOrganizationCreateCommand implements ICommand {
	static readonly type = '[UserOrganization] Create';

	constructor(
		public readonly user: IUser,
		public readonly organizationId: string
	) {}
}
