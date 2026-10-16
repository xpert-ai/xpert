import { PermissionsEnum } from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, FindManyOptions, FindOneOptions, FindOptionsWhere, In, IsNull, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
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

	private activeMemberWhere(organizationId: string): FindOptionsWhere<User> {
		const tenantId = this.currentTenantId()
		return {
			tenantId,
			deletedAt: IsNull(),
			organizations: { tenantId, organizationId, isActive: true }
		}
	}

	async findMemberCandidates(organizationId?: string) {
		this.requireOrganizationScope()
		const resolvedOrganizationId = await this.resolveAccessibleOrganizationId(organizationId)
		return this.userRepository.find({
			select: ['id', 'firstName', 'lastName', 'email', 'username', 'imageUrl'],
			where: this.activeMemberWhere(resolvedOrganizationId),
			order: { firstName: 'ASC', email: 'ASC' }
		})
	}

	private async validateMemberIds(memberIds: string[], organizationId?: string) {
		const resolvedOrganizationId = await this.resolveAccessibleOrganizationId(organizationId)
		if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== 'string' || !id.trim())) {
			throw new BadRequestException(
				t('server-ai:Error.InvalidUserGroupInput', {
					defaultValue: 'Invalid user group input.'
				})
			)
		}
		const ids = [...new Set(memberIds)]

		if (!ids.length) {
			return []
		}

		const users = await this.userRepository.find({
			select: ['id'],
			where: {
				...this.activeMemberWhere(resolvedOrganizationId),
				id: In(ids)
			}
		})

		if (users.length !== ids.length) {
			throw new BadRequestException(
				t('server-ai:Error.InvalidUserGroupMembers', {
					defaultValue: 'Some users are not active members of the current organization.'
				})
			)
		}

		return users
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

		const resolvedOrganizationId = await this.resolveAccessibleOrganizationId(
			organizationId ?? group.organizationId
		)
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

	private async prepareWrite(
		entity: DeepPartial<UserGroup>,
		organizationId: string
	): Promise<DeepPartial<UserGroup>> {
		return {
			...(entity.name !== undefined ? { name: entity.name } : {}),
			...(entity.description !== undefined ? { description: entity.description } : {}),
			...(entity.members !== undefined
				? {
						members: await this.validateMemberIds(
							entity.members?.map((member) => member?.id),
							organizationId
						)
					}
				: {})
		}
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

	public async create(entity: DeepPartial<UserGroup>): Promise<UserGroup> {
		const organizationId = this.requireOrganizationScope()
		return super.create(await this.prepareWrite(entity, organizationId))
	}

	public async update(id: string | number | FindOptionsWhere<UserGroup>, partialEntity: DeepPartial<UserGroup>) {
		const organizationId = this.requireOrganizationScope()
		const group = await this.repository.findOne({
			where: {
				...(typeof id === 'object' ? id : { id: String(id) }),
				tenantId: this.currentTenantId(),
				organizationId
			}
		})
		if (!group) {
			throw new NotFoundException(
				t('server-ai:Error.UserGroupNotFound', {
					defaultValue: 'The requested user group was not found in the current organization.'
				})
			)
		}
		return this.repository.save({
			...group,
			...(await this.prepareWrite(partialEntity, organizationId)),
			updatedById: RequestContext.currentUserId()
		})
	}

	public async save(entity: DeepPartial<UserGroup>): Promise<UserGroup> {
		return entity.id ? this.update(entity.id, entity) : this.create(entity)
	}

	public async delete(criteria: string | FindOptionsWhere<UserGroup>, options?: FindOneOptions<UserGroup>) {
		this.requireOrganizationScope()
		return super.delete(criteria, options)
	}
}
