import { IUserGroup, PermissionsEnum } from '@metad/contracts'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, FindManyOptions, FindOneOptions, FindOptionsWhere, In, Repository } from 'typeorm'
import { RequestContext } from '../core/context'
import { TenantOrganizationAwareCrudService } from '../core/crud'
import { Organization, User, UserOrganization } from '../core/entities/internal'
import { UserGroup } from './user-group.entity'

@Injectable()
export class UserGroupService extends TenantOrganizationAwareCrudService<UserGroup> {
	constructor(
		@InjectRepository(UserGroup)
		repository: Repository<UserGroup>,
		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>,
		@InjectRepository(UserOrganization)
		private readonly userOrganizationRepository: Repository<UserOrganization>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>
	) {
		super(repository)
	}

	private requireOrganizationScope() {
		return RequestContext.requireOrganizationScope()
	}

	private currentTenantId() {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is required for user group access.')
		}

		return tenantId
	}

	private async assertAccessibleOrganizationId(organizationId: string) {
		const tenantId = this.currentTenantId()
		const organization = await this.organizationRepository.findOne({
			select: ['id'],
			where: {
				id: organizationId,
				tenantId
			}
		})

		if (!organization) {
			throw new NotFoundException('The requested organization was not found in the current tenant.')
		}

		const currentOrganizationId = RequestContext.getOrganizationId()
		if (currentOrganizationId) {
			if (currentOrganizationId !== organizationId) {
				throw new ForbiddenException('Cross-organization access requires tenant scope.')
			}

			return organizationId
		}

		if (RequestContext.hasAnyPermission([PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ALL_ORG_EDIT])) {
			return organizationId
		}

		const userId = RequestContext.currentUserId()
		if (!userId) {
			throw new ForbiddenException('User context is required to access organization user groups.')
		}

		const membership = await this.userOrganizationRepository.findOne({
			select: ['id'],
			where: {
				tenantId,
				organizationId,
				userId,
				isActive: true
			}
		})

		if (!membership) {
			throw new ForbiddenException('You do not have access to the requested organization.')
		}

		return organizationId
	}

	public async resolveAccessibleOrganizationId(organizationId?: string | null) {
		if (!organizationId) {
			return this.requireOrganizationScope()
		}

		return this.assertAccessibleOrganizationId(organizationId)
	}

	private scopeOrganizationFilter(
		organizationId: string,
		filter?: FindManyOptions<UserGroup>
	): FindManyOptions<UserGroup> {
		const tenantId = this.currentTenantId()
		const where = filter?.where
		const scopedWhere = Array.isArray(where)
			? where.map((item) => ({
					...(item ?? {}),
					tenantId,
					organizationId
				}))
			: ({
					...(where ?? {}),
					tenantId,
					organizationId
				} as FindOptionsWhere<UserGroup>)

		return {
			...(filter ?? {}),
			where: scopedWhere
		}
	}

	private async validateMemberIds(memberIds: string[], organizationId?: string) {
		const resolvedOrganizationId = await this.resolveAccessibleOrganizationId(organizationId)
		const tenantId = this.currentTenantId()
		const ids = [...new Set((memberIds ?? []).filter(Boolean))]

		if (!ids.length) {
			return []
		}

		const users = await this.userRepository.find({
			select: ['id'],
			where: {
				id: In(ids),
				tenantId
			}
		})

		if (users.length !== ids.length) {
			throw new BadRequestException('Some users were not found in the current tenant.')
		}

		const memberships = await this.userOrganizationRepository.find({
			select: ['userId'],
			where: {
				tenantId,
				organizationId: resolvedOrganizationId,
				isActive: true,
				userId: In(ids)
			}
		})

		const memberIdsInOrg = new Set(memberships.map((membership) => membership.userId))
		if (memberIdsInOrg.size !== ids.length) {
			throw new BadRequestException('Some users are not active members of the current organization.')
		}

		return ids.map((id) => ({ id }) as User)
	}

	async updateMembers(id: string, memberIds: string[], organizationId?: string) {
		const group = await this.repository.findOne({
			where: {
				id,
				tenantId: this.currentTenantId()
			},
			relations: ['members']
		})

		if (!group) {
			throw new NotFoundException('The requested user group was not found in the current tenant.')
		}

		const resolvedOrganizationId = await this.resolveAccessibleOrganizationId(organizationId ?? group.organizationId)
		if (group.organizationId !== resolvedOrganizationId) {
			throw new ForbiddenException('Cross-organization access requires tenant scope.')
		}

		group.members = await this.validateMemberIds(memberIds, resolvedOrganizationId)

		return this.repository.save(group)
	}

	async findAllByOrganizationId(organizationId: string, filter?: FindManyOptions<UserGroup>) {
		const resolvedOrganizationId = await this.resolveAccessibleOrganizationId(organizationId)
		const options = this.scopeOrganizationFilter(resolvedOrganizationId, filter)
		const total = await this.repository.count(options)
		const items = await this.repository.find(options)

		return { items, total }
	}

	async findByIdsInOrganization(organizationId: string, ids: string[]) {
		const uniqueIds = [...new Set((ids ?? []).filter(Boolean))]
		if (!uniqueIds.length) {
			return []
		}

		const resolvedOrganizationId = await this.resolveAccessibleOrganizationId(organizationId)

		return this.repository.find(
			this.scopeOrganizationFilter(resolvedOrganizationId, {
				where: {
					id: In(uniqueIds)
				}
			})
		)
	}

	public async findAll(filter?: FindManyOptions<UserGroup>) {
		this.requireOrganizationScope()
		return super.findAll(filter)
	}

	public async findOne(
		id: string | number | FindOneOptions<UserGroup>,
		options?: FindOneOptions<UserGroup>
	): Promise<UserGroup> {
		this.requireOrganizationScope()
		return super.findOne(id, options)
	}

	public async create(entity: DeepPartial<UserGroup>, ...options: any[]): Promise<UserGroup> {
		this.requireOrganizationScope()
		return super.create(entity, ...options)
	}

	public async update(
		id: string | number | FindOptionsWhere<UserGroup>,
		partialEntity: Partial<IUserGroup>,
		...options: any[]
	) {
		this.requireOrganizationScope()
		return super.update(id, partialEntity as Partial<UserGroup>, ...options)
	}

	public async delete(criteria: string | FindOptionsWhere<UserGroup>, options?: FindOneOptions<UserGroup>) {
		this.requireOrganizationScope()
		return super.delete(criteria, options)
	}
}
