import { ICommand } from '@nestjs/cqrs'

export class CheckRolePermissionCommand implements ICommand {
	static readonly type = '[RolePermission] Check role permission'

	constructor(
		public readonly tenantId: string,
		public readonly roleId: string,
		public readonly permissions: string[],
		public readonly includeRole = false
	) {}
}
