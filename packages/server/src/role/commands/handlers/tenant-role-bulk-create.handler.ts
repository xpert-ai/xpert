import { IRole } from '@xpert-ai/contracts';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RoleService } from '../../role.service';
import { TenantRoleBulkCreateCommand } from '../tenant-role-bulk-create.command';
import { TenantRolePermissionBulkCreateCommand } from '../../../role-permission';


@CommandHandler(TenantRoleBulkCreateCommand)
export class TenantRoleBulkCreateHandler
	implements ICommandHandler<TenantRoleBulkCreateCommand> {
	constructor(
		private readonly roleService: RoleService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(
		command: TenantRoleBulkCreateCommand
	): Promise<IRole[]> {
		const { input: tenants } = command;

		//create roles/permissions after create tenant
		const roles = await this.roleService.createBulk(tenants);
		await this.commandBus.execute(new TenantRolePermissionBulkCreateCommand(tenants))
		return roles;
	}
}
