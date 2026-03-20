import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IUser, IUserOrganization, RolesEnum } from '@metad/contracts';
import { TenantAwareCrudService } from './../core/crud';
import { Organization, User, UserOrganization } from './../core/entities/internal';

@Injectable()
export class UserOrganizationService extends TenantAwareCrudService<UserOrganization> {
	constructor(
		@InjectRepository(UserOrganization)
		private readonly userOrganizationRepository: Repository<UserOrganization>,

		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>
	) {
		super(userOrganizationRepository);
	}

	async addUserToOrganization(
		user: IUser,
		organizationId: string
	): Promise<IUserOrganization | IUserOrganization[]> {
		const roleName: string = user.role?.name;
		const tenantId = user.tenant?.id ?? user.tenantId

		if (!user.id || !tenantId) {
			throw new Error('User id and tenant are required')
		}

		if (roleName === RolesEnum.SUPER_ADMIN) {
			return this._addUserToAllOrganizations(user.id, tenantId);
		}

		const [membership] = await this.ensureUserOrganizations(user.id, tenantId, [organizationId])
		return membership
	}

	private async ensureUserOrganizations(
		userId: string,
		tenantId: string,
		organizationIds: string[]
	): Promise<IUserOrganization[]> {
		const normalizedOrganizationIds = Array.from(new Set(organizationIds.filter(Boolean)))
		if (!normalizedOrganizationIds.length) {
			return []
		}

		const existingRelations = await this.repository.find({
			where: normalizedOrganizationIds.map((organizationId) => ({
				tenantId,
				userId,
				organizationId
			}))
		})
		const membershipByOrganizationId = new Map(
			existingRelations.map((membership) => [membership.organizationId, membership])
		)
		const missingOrganizationIds = normalizedOrganizationIds.filter(
			(organizationId) => !membershipByOrganizationId.has(organizationId)
		)

		if (missingOrganizationIds.length) {
			const createdMemberships = await this.repository.save(
				missingOrganizationIds.map((organizationId) =>
					this.repository.create({
						tenantId,
						userId,
						organizationId
					})
				)
			)
			for (const membership of createdMemberships) {
				membershipByOrganizationId.set(membership.organizationId, membership)
			}
		}

		return normalizedOrganizationIds
			.map((organizationId) => membershipByOrganizationId.get(organizationId))
			.filter((membership): membership is IUserOrganization => !!membership)
	}

	private async _addUserToAllOrganizations(
		userId: string,
		tenantId: string
	): Promise<IUserOrganization[]> {
		const organizations = await this.organizationRepository.find({
			select: ['id'],
			where: { tenant: { id: tenantId } },
			relations: ['tenant']
		});

		return this.ensureUserOrganizations(
			userId,
			tenantId,
			organizations.map((organization) => organization.id)
		);
	}
}
