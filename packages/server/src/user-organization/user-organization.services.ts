import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, DeleteResult, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm';
import { IUser, IUserOrganization, RolesEnum } from '@metad/contracts';
import { TenantAwareCrudService } from './../core/crud';
import { Organization, UserOrganization } from './../core/entities/internal';
import { RequestContext } from '../core/context';

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

	private currentTenantId(explicitTenantId?: string) {
		const tenantId = explicitTenantId ?? RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is required.')
		}

		return tenantId
	}

	private async ensureUniqueDefault(userId: string, tenantId: string, membershipId?: string) {
		if (!userId) {
			return
		}

		const where = membershipId
			? {
					userId,
					tenantId
			  }
			: {
					userId,
					tenantId
			  }

		const memberships = await this.repository.find({
			where
		})

		for (const membership of memberships) {
			if (membershipId && membership.id === membershipId) {
				continue
			}
			if (membership.isDefault) {
				await super.update(membership.id, { isDefault: false } as Partial<UserOrganization>)
			}
		}
	}

	private async ensureActiveMembershipRemains(userId: string, tenantId: string, excludedId?: string) {
		const memberships = await this.repository.find({
			where: {
				userId,
				tenantId
			}
		})

		const activeMemberships = memberships.filter((membership) => {
			if (excludedId && membership.id === excludedId) {
				return false
			}

			return membership.isActive
		})

		if (!activeMemberships.length) {
			throw new BadRequestException('User must have at least one active organization membership.')
		}
	}

	private async resolveMembershipForDelete(
		criteria: string | FindOptionsWhere<UserOrganization>,
		options?: FindOneOptions<UserOrganization>
	) {
		if (typeof criteria === 'string') {
			return this.findOneByIdString(criteria, options)
		}

		const where = options?.where
			? ({
					...(criteria as FindOptionsWhere<UserOrganization>),
					...(options.where as FindOptionsWhere<UserOrganization>)
			  } as FindOptionsWhere<UserOrganization>)
			: criteria

		return this.findOneByOptions({
			...(options ?? {}),
			where
		})
	}

	private async resolveRemainingMemberships(
		membership: UserOrganization
	): Promise<UserOrganization[]> {
		const memberships = await this.repository.find({
			where: {
				userId: membership.userId,
				tenantId: membership.tenantId
			}
		})

		const remainingMemberships = memberships.filter((item) => item.id !== membership.id)

		if (!remainingMemberships.length) {
			throw new BadRequestException(
				'Cannot remove the last organization membership. Delete the user explicitly instead.'
			)
		}

		await this.ensureActiveMembershipRemains(membership.userId, membership.tenantId, membership.id)

		return remainingMemberships
	}

	private pickNextDefaultMembership(memberships: UserOrganization[]) {
		return memberships.find((membership) => membership.isActive) ?? memberships[0] ?? null
	}

	private async prepareCreateEntity(
		entity: DeepPartial<UserOrganization>,
		explicitTenantId?: string
	) {
		if (!entity.userId || !entity.organizationId) {
			throw new BadRequestException('User and organization are required.')
		}

		const tenantId = this.currentTenantId(explicitTenantId ?? entity.tenantId)

		const existing = await this.repository.findOne({
			where: {
				userId: entity.userId,
				organizationId: entity.organizationId,
				tenantId
			}
		})

		if (existing) {
			throw new BadRequestException('User is already a member of this organization.')
		}

		const memberships = await this.repository.find({
			where: {
				userId: entity.userId,
				tenantId
			}
		})

		const isFirstMembership = memberships.length === 0
		const isDefault = entity.isDefault ?? isFirstMembership
		const isActive = entity.isActive ?? true

		if (!isActive && isFirstMembership) {
			throw new BadRequestException('The first organization membership must be active.')
		}

		if (isDefault) {
			await this.ensureUniqueDefault(entity.userId, tenantId)
		}

		return {
			...entity,
			tenant: entity.tenant ?? ({ id: tenantId } as any),
			tenantId,
			isDefault,
			isActive
		}
	}

	async addUserToOrganization(
		user: IUser,
		organizationId: string
	): Promise<IUserOrganization | IUserOrganization[]> {
		const roleName: string = user.role?.name;

		if (roleName === RolesEnum.SUPER_ADMIN) {
			// Ensure tenant is available before accessing tenant.id
			if (!user.tenant?.id) {
				throw new Error('User tenant is required for SUPER_ADMIN role')
			}
			return this._addUserToAllOrganizations(user.id, user.tenant.id);
		}

		const entity: IUserOrganization = new UserOrganization();
		entity.organizationId = organizationId;
		entity.tenantId = user.tenantId;
		entity.userId = user.id;
		return await this.create(entity);
	}

	override async create(entity: DeepPartial<UserOrganization>, ...options: any[]) {
		const payload = await this.prepareCreateEntity(entity)
		return super.create(payload, ...options)
	}

	override async update(
		id: string | number,
		entity: Partial<IUserOrganization>,
		...options: any[]
	) {
		const membership = await this.findOneByIdString(String(id))

		if (entity.isActive === false && membership.isActive) {
			await this.ensureActiveMembershipRemains(membership.userId, membership.tenantId, membership.id)
		}

		if (entity.isDefault === true) {
			await this.ensureUniqueDefault(membership.userId, membership.tenantId, membership.id)
		}

		return super.update(id, entity as Partial<UserOrganization>, ...options)
	}

	override async delete(
		criteria: string | FindOptionsWhere<UserOrganization>,
		options?: FindOneOptions<UserOrganization>
	): Promise<DeleteResult> {
		const membership = await this.resolveMembershipForDelete(criteria, options)
		const remainingMemberships = await this.resolveRemainingMemberships(membership)
		const shouldReassignDefault =
			membership.isDefault || !remainingMemberships.some((item) => item.isDefault)

		const result = await super.delete(criteria, options)

		if (shouldReassignDefault) {
			const nextDefaultMembership = this.pickNextDefaultMembership(remainingMemberships)
			if (nextDefaultMembership) {
				await this.ensureUniqueDefault(membership.userId, membership.tenantId, nextDefaultMembership.id)
				await super.update(nextDefaultMembership.id, {
					isDefault: true
				} as Partial<UserOrganization>)
			}
		}

		return result
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
		const entities: IUserOrganization[] = [];

		for await (const organization of organizations) {
			const entity: IUserOrganization = new UserOrganization();
			entity.organizationId = organization.id;
			entity.tenantId = tenantId;
			entity.userId = userId;
			entities.push(entity);
		}
		return await this.repository.save(entities);
	}
}
