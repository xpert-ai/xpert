import { ICommandHandler, CommandHandler, CommandBus } from '@nestjs/cqrs';
import { PermissionApprovalService } from '../../permission-approval.service';
import { PermissionApproval } from '../../permission-approval.entity';
import { PermissionApprovalAdminCommand } from '../permission-approval.admin.command';
import { BusinessAreaMyCommand } from '../../../business-area';
import { BusinessAreaRole } from '@xpert-ai/contracts';

@CommandHandler(PermissionApprovalAdminCommand)
export class PermissionApprovalAdminHandler
	implements ICommandHandler<PermissionApprovalAdminCommand> {
	constructor(
		private permissionApprovalService: PermissionApprovalService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(
		command?: PermissionApprovalAdminCommand
	): Promise<{items: PermissionApproval[], total: number}> {
		const { user } = command;

		const businessAreas = await this.commandBus.execute(new BusinessAreaMyCommand(user, BusinessAreaRole.Modeler))

		return this.permissionApprovalService.findAllPermissionApprovals(businessAreas)
	}
}
