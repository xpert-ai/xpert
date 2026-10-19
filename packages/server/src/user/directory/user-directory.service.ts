import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { type IPagination, type IUserDirectoryItem, PermissionsEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Brackets, Repository } from 'typeorm'
import { User } from '../user.entity'
import type { UserDirectoryQuery } from './user-directory.schema'

@Injectable()
export class UserDirectoryService {
	constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

	async list(query: UserDirectoryQuery): Promise<IPagination<IUserDirectoryItem>> {
		const tenantId = RequestContext.currentTenantId()
		const tenantScope = RequestContext.isTenantScope()
		const permissions = [PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ALL_ORG_EDIT]
		if (!tenantScope) permissions.push(PermissionsEnum.ORG_USERS_VIEW, PermissionsEnum.ORG_USERS_EDIT)
		if (!tenantId || !RequestContext.hasAnyPermission(permissions)) throw new ForbiddenException()
		const organizationId = tenantScope ? null : RequestContext.requireOrganizationScope()
		const membershipScope =
			'membership.tenantId = :tenantId' +
			(organizationId ? ' AND membership.organizationId = :organizationId' : '')
		const builder = this.users
			.createQueryBuilder('user')
			.withDeleted()
			.leftJoin('user.role', 'role')
			.leftJoin('user.organizations', 'membership', membershipScope)
			.leftJoin('membership.organization', 'organization', 'organization.tenantId = :tenantId')
			.select([
				'user.id',
				'user.firstName',
				'user.lastName',
				'user.username',
				'user.email',
				'user.mobile',
				'user.imageUrl',
				'user.type',
				'user.updatedAt',
				'user.deletedAt',
				'role.id',
				'role.name',
				'membership.id',
				'organization.id',
				'organization.name'
			])
			.where('user.tenantId = :tenantId', { tenantId })
			.andWhere('user.type IN (:...types)', { types: query.types.length ? query.types : Object.values(UserType) })

		if (organizationId) builder.andWhere('membership.organizationId = :organizationId', { organizationId })
		if (query.roles.length) builder.andWhere('role.name IN (:...roles)', { roles: query.roles })
		if (query.status !== 'all') builder.andWhere(`user.deletedAt IS ${query.status === 'active' ? '' : 'NOT '}NULL`)

		// Separate filter joins keep every visible organization on matching tenant-directory rows.
		if (query.organizationIds.length || query.search) {
			builder
				.leftJoin(
					'user.organizations',
					'filterMembership',
					membershipScope.split('membership.').join('filterMembership.')
				)
				.leftJoin(
					'filterMembership.organization',
					'filterOrganization',
					'filterOrganization.tenantId = :tenantId'
				)
		}
		if (query.organizationIds.length) {
			builder.andWhere('filterMembership.organizationId IN (:...organizationIds)', {
				organizationIds: query.organizationIds
			})
		}
		if (query.search) {
			const search = `%${query.search.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`
			builder.andWhere(
				new Brackets((where) => {
					for (const field of [
						'user.firstName',
						'user.lastName',
						'user.username',
						'user.email',
						'user.mobile',
						'filterOrganization.name'
					]) {
						where.orWhere(`LOWER(${field}) LIKE :search`, { search })
					}
					where.orWhere("LOWER(CONCAT(user.firstName, ' ', user.lastName)) LIKE :search", { search })
				})
			)
		}

		const [users, total] = await builder
			.orderBy('user.firstName', 'ASC')
			.addOrderBy('user.lastName', 'ASC')
			.addOrderBy('user.username', 'ASC')
			.addOrderBy('user.id', 'ASC')
			.take(query.take)
			.skip(query.skip)
			.getManyAndCount()
		return { items: users.map(toDirectoryItem), total }
	}
}

function toDirectoryItem(user: User): IUserDirectoryItem {
	const { organizations, ...identity } = user
	return {
		...identity,
		displayOrganizations: (organizations ?? [])
			.flatMap(({ organization }) => (organization ? [organization] : []))
			.sort((left, right) => left.name.localeCompare(right.name))
	}
}
