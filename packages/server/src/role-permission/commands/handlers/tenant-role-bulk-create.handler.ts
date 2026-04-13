import { IRolePermission } from '@xpert-ai/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RolePermissionService } from '../../../role-permission/role-permission.service'
import { TenantRolePermissionBulkCreateCommand } from '../tenant-role-bulk-create.command'

@CommandHandler(TenantRolePermissionBulkCreateCommand)
export class TenantRolePermissionBulkCreateHandler implements ICommandHandler<TenantRolePermissionBulkCreateCommand> {
	constructor(private readonly rolePermissionService: RolePermissionService) {}

	public async execute(command: TenantRolePermissionBulkCreateCommand): Promise<IRolePermission[]> {
		const { input: tenants } = command

		//create roles-permissions after create tenant
		return await this.rolePermissionService.updateRolesAndPermissions(tenants)
	}
}
