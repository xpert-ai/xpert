// Invariants: resolve the live user role and organization access within an explicit tenant.
// SUPER_ADMIN may have no membership row; this check never grants resource-level permissions.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RolesEnum, UserType } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { Organization } from '../../../organization/organization.entity'
import { User } from '../../../user/user.entity'
import { UserOrganization } from '../../user-organization.entity'
import { ResolveUserOrganizationAccessCommand } from '../resolve-user-organization-access.command'

@CommandHandler(ResolveUserOrganizationAccessCommand)
export class ResolveUserOrganizationAccessHandler implements ICommandHandler<ResolveUserOrganizationAccessCommand> {
	constructor(
		@InjectRepository(User) private readonly users: Repository<User>,
		@InjectRepository(UserOrganization) private readonly memberships: Repository<UserOrganization>,
		@InjectRepository(Organization) private readonly organizations: Repository<Organization>
	) {}

	/** Returns the current human user with organization access, or null when access is denied. */
	async execute({ input }: ResolveUserOrganizationAccessCommand): Promise<User | null> {
		const { tenantId, organizationId, userId } = input
		if (!tenantId?.trim() || !organizationId?.trim() || !userId?.trim()) return null
		const user = await this.users.findOne({
			where: { id: userId, tenantId },
			relations: ['role']
		})
		if (!user || user.type !== UserType.USER) return null

		if (user.role?.name === RolesEnum.SUPER_ADMIN) {
			const organization = await this.organizations.findOne({
				where: { id: organizationId, tenantId, isActive: true }
			})
			return organization ? user : null
		}

		const membership = await this.memberships.findOne({
			where: {
				tenantId,
				organizationId,
				userId,
				isActive: true,
				organization: { tenantId, isActive: true }
			}
		})
		return membership ? user : null
	}
}
