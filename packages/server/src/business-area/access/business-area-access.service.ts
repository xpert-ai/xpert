// Grants remain source records. Membership is checked on every evaluation; revocation never needs per-user grant cleanup.
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	businessAreaRoleAllows,
	PermissionsEnum,
	UserType,
	type IBusinessAreaAccess,
	type IBusinessAreaAccessGrant,
	type IBusinessAreaCapabilities,
	type TBusinessAreaAction,
	type TBusinessAreaGrantInput
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { IsNull, Repository } from 'typeorm'
import { BusinessArea } from '../business-area.entity'
import { User } from '../../user/user.entity'
import { UserGroup } from '../../user-group/user-group.entity'
import { BusinessAreaAccessGrant } from './business-area-access.entity'
import { businessAreaAccessSql } from './business-area-access.sql'

@Injectable()
export class BusinessAreaAccessService {
	constructor(
		@InjectRepository(BusinessAreaAccessGrant) private readonly grants: Repository<BusinessAreaAccessGrant>
	) {}

	private scope() {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.requireOrganizationScope()
		const userId = RequestContext.currentUserId()
		if (!tenantId || !userId) throw new ForbiddenException(t('server-ai:Error.BusinessAreaAccessDenied'))
		return { tenantId, organizationId, userId }
	}

	private platformManagement() {
		return RequestContext.hasPermission(PermissionsEnum.BUSINESS_AREA_MANAGE)
	}

	private async area(id: string) {
		const { tenantId, organizationId } = this.scope()
		const area = await this.grants.manager.getRepository(BusinessArea).findOneBy({ id, tenantId, organizationId })
		if (!area) throw new NotFoundException(t('server-ai:Error.BusinessAreaNotFound'))
		return area
	}

	async capabilities(): Promise<IBusinessAreaCapabilities> {
		const { tenantId, organizationId, userId } = this.scope()
		const areas = await this.grants.manager
			.getRepository(BusinessArea)
			.find({ where: { tenantId, organizationId }, select: ['id'] })
		const result: IBusinessAreaCapabilities = { view: [], publish: [], manage: [] }
		for (const action of ['view', 'publish', 'manage'] as const) {
			if (this.platformManagement()) result[action] = areas.map((area) => area.id)
			else {
				const allowed = await this.grants.manager
					.getRepository(BusinessArea)
					.createQueryBuilder('area')
					.select(['area.id'])
					.where('area.tenantId = :tenantId AND area.organizationId = :organizationId', {
						tenantId,
						organizationId
					})
					.andWhere(businessAreaAccessSql('area.id', ':tenantId', ':organizationId', ':userId', action), {
						userId
					})
					.getMany()
				result[action] = allowed.map((area) => area.id)
			}
		}
		return result
	}

	async assertAccess(id: string, action: TBusinessAreaAction): Promise<void> {
		await this.area(id)
		if (this.platformManagement()) return
		const { tenantId, organizationId, userId } = this.scope()
		const allowed = await this.grants
			.createQueryBuilder('areaGrant')
			.where('areaGrant.businessAreaId = :id', { id })
			.andWhere(
				businessAreaAccessSql(
					'"areaGrant"."businessAreaId"',
					':tenantId',
					':organizationId',
					':userId',
					action
				),
				{ tenantId, organizationId, userId }
			)
			.getExists()
		if (!allowed) throw new ForbiddenException(t('server-ai:Error.BusinessAreaAccessDenied'))
	}

	async explain(id: string, targetUserId?: string): Promise<IBusinessAreaAccess> {
		await this.area(id)
		const { tenantId, organizationId, userId: actorId } = this.scope()
		const userId = targetUserId ?? actorId
		if (userId !== actorId) await this.assertAccess(id, 'manage')
		const user = await this.activeUser(userId)
		if (!user) throw new BadRequestException(t('server-ai:Error.BusinessAreaInvalidSubject'))
		const sources = await this.grants
			.createQueryBuilder('areaGrant')
			.leftJoinAndSelect('areaGrant.userGroup', 'directoryGroup')
			.leftJoin('directoryGroup.members', 'member', 'member.id = :userId', { userId })
			.where(
				'areaGrant.tenantId = :tenantId AND areaGrant.organizationId = :organizationId AND areaGrant.businessAreaId = :id',
				{ tenantId, organizationId, id }
			)
			.andWhere(
				`((areaGrant.subjectType = 'user' AND areaGrant.userId = :userId) OR (areaGrant.subjectType = 'user_group' AND member.id = :userId AND directoryGroup.managedBy IS NULL AND directoryGroup.tenantId = :tenantId AND directoryGroup.organizationId = :organizationId))`,
				{ userId, tenantId, organizationId }
			)
			.getMany()
		const platformManagement =
			userId === actorId
				? this.platformManagement()
				: await this.grants.manager
						.getRepository(User)
						.createQueryBuilder('principal')
						.innerJoin(
							'role_permission',
							'permission',
							'permission."roleId" = principal."roleId" AND permission."tenantId" = principal."tenantId"'
						)
						.where('principal.id = :userId AND principal.tenantId = :tenantId', { userId, tenantId })
						.andWhere('permission.enabled = true AND permission.permission = :permission', {
							permission: PermissionsEnum.BUSINESS_AREA_MANAGE
						})
						.getExists()
		return {
			businessAreaId: id,
			userId,
			platformManagement,
			canView: platformManagement || sources.some((source) => businessAreaRoleAllows(source.role, 'view')),
			canPublish: platformManagement || sources.some((source) => businessAreaRoleAllows(source.role, 'publish')),
			canManage: platformManagement || sources.some((source) => businessAreaRoleAllows(source.role, 'manage')),
			sources: sources.map((source) => this.toGrant(source))
		}
	}

	async list(id: string): Promise<IBusinessAreaAccessGrant[]> {
		await this.assertAccess(id, 'manage')
		const { tenantId, organizationId } = this.scope()
		const rows = await this.grants.find({
			where: { tenantId, organizationId, businessAreaId: id },
			relations: ['user', 'userGroup'],
			order: { createdAt: 'ASC' }
		})
		return rows.map((row) => this.toGrant(row))
	}

	async forGroup(groupId: string): Promise<IBusinessAreaAccessGrant[]> {
		const { tenantId, organizationId } = this.scope()
		if (!RequestContext.hasPermission(PermissionsEnum.ORG_USERS_VIEW))
			throw new ForbiddenException(t('server-ai:Error.BusinessAreaAccessDenied'))
		await this.directoryGroup(groupId)
		const rows = await this.grants.find({ where: { tenantId, organizationId, userGroupId: groupId } })
		return rows.map((row) => this.toGrant(row))
	}

	async candidates(id: string) {
		await this.assertAccess(id, 'manage')
		const { tenantId, organizationId } = this.scope()
		const [users, groups] = await Promise.all([
			this.grants.manager.getRepository(User).find({
				select: ['id', 'firstName', 'lastName', 'username'],
				where: {
					tenantId,
					type: UserType.USER,
					isActive: true,
					deletedAt: IsNull(),
					organizations: { tenantId, organizationId, isActive: true }
				}
			}),
			this.grants.manager
				.getRepository(UserGroup)
				.find({ select: ['id', 'name'], where: { tenantId, organizationId, managedBy: IsNull() } })
		])
		return {
			users: users.map((user) => ({
				id: user.id,
				name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.id
			})),
			groups: groups.map((group) => ({ id: group.id, name: group.name }))
		}
	}

	async upsert(id: string, input: TBusinessAreaGrantInput): Promise<IBusinessAreaAccessGrant> {
		await this.assertAccess(id, 'manage')
		if (input.subjectType === 'user') {
			if (!(await this.activeUser(input.userId)))
				throw new BadRequestException(t('server-ai:Error.BusinessAreaInvalidSubject'))
		} else await this.directoryGroup(input.userGroupId)
		const { tenantId, organizationId, userId } = this.scope()
		return this.grants.manager.transaction(async (manager) => {
			await manager
				.getRepository(BusinessArea)
				.findOneOrFail({ where: { id, tenantId, organizationId }, lock: { mode: 'pessimistic_write' } })
			const repository = manager.getRepository(BusinessAreaAccessGrant)
			const subject =
				input.subjectType === 'user'
					? { userId: input.userId, userGroupId: IsNull() }
					: { userGroupId: input.userGroupId, userId: IsNull() }
			const current = await repository.findOneBy({ tenantId, organizationId, businessAreaId: id, ...subject })
			const row = repository.create({
				...current,
				tenantId,
				organizationId,
				businessAreaId: id,
				subjectType: input.subjectType,
				userId: input.subjectType === 'user' ? input.userId : null,
				userGroupId: input.subjectType === 'user_group' ? input.userGroupId : null,
				role: input.role,
				createdById: current?.createdById ?? userId,
				updatedById: userId
			})
			return this.toGrant(await repository.save(row))
		})
	}

	async remove(id: string, grantId: string): Promise<void> {
		await this.assertAccess(id, 'manage')
		const { tenantId, organizationId } = this.scope()
		await this.grants.delete({ id: grantId, tenantId, organizationId, businessAreaId: id })
	}

	private activeUser(id: string) {
		const { tenantId, organizationId } = this.scope()
		return this.grants.manager.getRepository(User).findOne({
			select: ['id', 'firstName', 'lastName'],
			where: {
				id,
				tenantId,
				type: UserType.USER,
				isActive: true,
				deletedAt: IsNull(),
				organizations: { tenantId, organizationId, isActive: true }
			}
		})
	}

	private async directoryGroup(id: string) {
		const { tenantId, organizationId } = this.scope()
		const group = await this.grants.manager
			.getRepository(UserGroup)
			.findOneBy({ id, tenantId, organizationId, managedBy: IsNull() })
		if (!group) throw new BadRequestException(t('server-ai:Error.BusinessAreaInvalidSubject'))
		return group
	}

	private toGrant(row: BusinessAreaAccessGrant): IBusinessAreaAccessGrant {
		return {
			id: row.id,
			tenantId: row.tenantId,
			organizationId: row.organizationId,
			businessAreaId: row.businessAreaId,
			subjectType: row.subjectType,
			userId: row.userId,
			userGroupId: row.userGroupId,
			role: row.role,
			subjectName:
				row.userGroup?.name ??
				(row.user ? [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') : undefined),
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			createdById: row.createdById,
			updatedById: row.updatedById
		}
	}
}
