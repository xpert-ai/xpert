import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserOrganizationDeleteCommand } from '../user-organization.delete.command';
import { UserOrganization } from '../../user-organization.entity';
import { UserService } from '../../../user/user.service';
import { UserOrganizationService } from '../../user-organization.services';
import { DeleteResult } from 'typeorm';
import { RoleService } from '../../../role/role.service';
import { RolesEnum, LanguagesEnum, IUser } from '@metad/contracts';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

/**
 * Removes a user-organization membership after validating membership invariants.
 * Super Admin memberships can only be removed by another Super Admin, and only
 * when another Super Admin still remains in the tenant.
 */
@CommandHandler(UserOrganizationDeleteCommand)
export class UserOrganizationDeleteHandler
	implements ICommandHandler<UserOrganizationDeleteCommand> {
	constructor(
		private readonly userOrganizationService: UserOrganizationService,
		private readonly userService: UserService,
		private readonly roleService: RoleService,
		private readonly i18n: I18nService
	) {}

	public async execute(
		command: UserOrganizationDeleteCommand
	): Promise<UserOrganization | DeleteResult> {
		const { input } = command;

		// 1. find user to delete
		const {
			user: {
				role: { name: roleName }
			},
			userId
		} = await this.userOrganizationService.findOne(
			input.userOrganizationId,
			{ relations: ['user', 'user.role'] }
		);

		// 2. Handle Super Admin Deletion if applicable
		if (roleName === RolesEnum.SUPER_ADMIN)
			return this._removeSuperAdmin(
				input.requestingUser,
				userId,
				input.userOrganizationId,
				input.language
			);

		return this._removeUserFromOrganization(
			input.userOrganizationId
		);
	}

	private async _removeUserFromOrganization(
		userOrganizationId: string
	): Promise<UserOrganization | DeleteResult> {
		return this.userOrganizationService.delete(userOrganizationId);
	}

	private async _removeSuperAdmin(
		requestingUser: IUser,
		userId: string,
		userOrganizationId: string,
		language: LanguagesEnum
	): Promise<UserOrganization | DeleteResult> {
		// 1. Check if the requesting user has permission to delete Super Admin
		const { name: requestingUserRoleName } = await this.roleService.findOne(
			requestingUser.roleId
		);

		if (requestingUserRoleName !== RolesEnum.SUPER_ADMIN)
			throw new UnauthorizedException(
				'Only Super Admin user can delete Super Admin users'
			);

		// 2. Check if there are at least 2 Super Admins before deleting Super Admin user
		const { total } = await this.userService.findAll({
			where: {
				role: { id: requestingUser.roleId },
				tenant: { id: requestingUser.tenantId }
			},
			relations: ['role', 'tenant']
		});

		if (total === 1)
			throw new BadRequestException(
				await this.i18n.translate(
					'USER_ORGANIZATION.CANNOT_DELETE_ALL_SUPER_ADMINS',
					{
						lang: language,
						args: { count: 1 }
					}
				)
			);

		return this._removeUserFromOrganization(userOrganizationId)
	}
}
