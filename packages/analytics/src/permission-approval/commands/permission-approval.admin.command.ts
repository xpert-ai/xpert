import { IUser } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class PermissionApprovalAdminCommand implements ICommand {
	static readonly type = '[PermissionApproval] Admin';

	constructor(
		public readonly user: IUser,
	) {}
}
