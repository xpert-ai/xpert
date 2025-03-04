import { IUserOrganization } from '@metad/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { RoleService } from '../../../role/role.service'
import { UserService } from '../../../user/user.service'
import { UserOrganizationService } from '../../user-organization.services'
import { UserOrganizationCreateCommand } from '../user-organization.create.command'

@CommandHandler(UserOrganizationCreateCommand)
export class UserOrganizationCreateHandler implements ICommandHandler<UserOrganizationCreateCommand> {
	constructor(
		private readonly userOrganizationService: UserOrganizationService,
		private readonly userService: UserService,
		private readonly roleService: RoleService,
		private readonly i18n: I18nService
	) {}

	public async execute(command: UserOrganizationCreateCommand): Promise<IUserOrganization | IUserOrganization[]> {
		const { user, organizationId } = command

		return await this.userOrganizationService.addUserToOrganization(user, organizationId)
	}
}
