import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RolePermissionService } from '../../role-permission.service'
import { CheckRolePermissionCommand } from '../check-role-permission.command'

@CommandHandler(CheckRolePermissionCommand)
export class CheckRolePermissionHandler implements ICommandHandler<CheckRolePermissionCommand> {
	constructor(private readonly rolePermissionService: RolePermissionService) {}

	public async execute(command: CheckRolePermissionCommand): Promise<boolean> {
		return await this.rolePermissionService.checkRolePermission(
			command.tenantId,
			command.roleId,
			command.permissions,
			command.includeRole
		)
	}
}
