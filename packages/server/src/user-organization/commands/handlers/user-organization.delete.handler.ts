import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserOrganizationDeleteCommand } from '../user-organization.delete.command';
import { UserOrganization } from '../../user-organization.entity';
import { UserService } from '../../../user/user.service';
import { UserOrganizationService } from '../../user-organization.services';
import { DeleteResult } from 'typeorm';
import { RoleService } from '../../../role/role.service';
import { RolesEnum, LanguagesEnum, IUser } from '@xpert-ai/contracts';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENT_USER_ORGANIZATION_DELETED, UserOrganizationDeletedEvent } from '../../../user/events';


/**
 * 1. Remove user from given organization if user belongs to multiple organizations
 * 2. Keep the user record when removing the final organization membership
 * 3. Allow the deletion of Admin and Super Admin Users only if there are more than 1 users of that Role.
 * 4. Super Admin membership can be removed only by a Super Admin user.
 */
@CommandHandler(UserOrganizationDeleteCommand)
export class UserOrganizationDeleteHandler
	implements ICommandHandler<UserOrganizationDeleteCommand> {
	constructor(
		private readonly userOrganizationService: UserOrganizationService,
		private readonly userService: UserService,
		private readonly roleService: RoleService,
		private readonly i18n: I18nService,
		private readonly eventEmitter: EventEmitter2
	) {}

	public async execute(
		command: UserOrganizationDeleteCommand
	): Promise<UserOrganization | DeleteResult> {
		const { input } = command;

		// 1. find user to delete
		const {
			tenantId,
			organizationId,
			user: {
				role: { name: roleName }
			},
			userId
		} = await this.userOrganizationService.findOne(
			input.userOrganizationId,
			{ relations: ['user', 'user.role'] }
		);

		// 2. Handle Super Admin Deletion if applicable
		if (roleName === RolesEnum.SUPER_ADMIN) {
			await this.ensureSuperAdminMembershipRemovalAllowed(
				input.requestingUser,
				input.language
			);
		}

		const result = await this._removeUserFromOrganization(
			input.userOrganizationId
		);
		this.emitUserOrganizationDeletedEvents(
			[
				{
					tenantId,
					organizationId
				}
			],
			userId
		);
		return result;
	}

	private async _removeUserFromOrganization(
		userOrganizationId: string
	): Promise<UserOrganization | DeleteResult> {
		return this.userOrganizationService.delete(userOrganizationId, {
			allowDeletingLastMembership: true
		});
	}

	private async ensureSuperAdminMembershipRemovalAllowed(
		requestingUser: IUser,
		language: LanguagesEnum
	) {
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
	}

	private emitUserOrganizationDeletedEvents(
		memberships: Array<{ tenantId: string; organizationId: string }>,
		userId: string
	) {
		for (const membership of memberships) {
			this.eventEmitter.emit(
				EVENT_USER_ORGANIZATION_DELETED,
				new UserOrganizationDeletedEvent(membership.tenantId, membership.organizationId, userId)
			);
		}
	}
}
