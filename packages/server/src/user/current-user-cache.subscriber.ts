// Invalidate after commit, including bulk updates whose TypeORM events omit entity IDs.
import { Injectable } from '@nestjs/common'
import {
	DataSource,
	EntitySubscriberInterface,
	InsertEvent,
	UpdateEvent,
	RemoveEvent,
	SoftRemoveEvent,
	RecoverEvent,
	QueryRunner,
	TransactionCommitEvent,
	TransactionRollbackEvent
} from 'typeorm'
import { CurrentUserCacheDependency, CurrentUserCacheService } from './current-user-cache.service'
import { User } from './user.entity'
import { Tenant } from '../tenant/tenant.entity'
import { Role } from '../role/role.entity'
import { RolePermission } from '../role-permission/role-permission.entity'
import { Employee } from '../employee/employee.entity'
import { UserOrganization } from '../user-organization/user-organization.entity'
import { Organization } from '../organization/organization.entity'
import { Feature } from '../feature/feature.entity'
import { FeatureOrganization } from '../feature/feature-organization.entity'

const entities = new Map<Function | string, CurrentUserCacheDependency>([
	[User, 'User'],
	[Tenant, 'Tenant'],
	[Role, 'Role'],
	[RolePermission, 'RolePermission'],
	[Employee, 'Employee'],
	[UserOrganization, 'UserOrganization'],
	[Organization, 'Organization'],
	[Feature, 'Feature'],
	[FeatureOrganization, 'FeatureOrganization']
])
type ChangeEvent =
	| InsertEvent<unknown>
	| UpdateEvent<unknown>
	| RemoveEvent<unknown>
	| SoftRemoveEvent<unknown>
	| RecoverEvent<unknown>
type Invalidation = { dependency: CurrentUserCacheDependency; tenantId?: string }

@Injectable()
export class CurrentUserCacheSubscriber implements EntitySubscriberInterface {
	private readonly pending = new WeakMap<QueryRunner, Map<string, Invalidation>>()

	constructor(
		dataSource: DataSource,
		private readonly cache: CurrentUserCacheService
	) {
		dataSource.subscribers.push(this)
	}

	afterInsert(event: InsertEvent<unknown>) {
		return this.changed(event)
	}
	afterUpdate(event: UpdateEvent<unknown>) {
		return this.changed(event)
	}
	afterRemove(event: RemoveEvent<unknown>) {
		return this.changed(event)
	}
	afterSoftRemove(event: SoftRemoveEvent<unknown>) {
		return this.changed(event)
	}
	afterRecover(event: RecoverEvent<unknown>) {
		return this.changed(event)
	}

	async afterTransactionCommit(event: TransactionCommitEvent) {
		if (event.queryRunner.isTransactionActive) return
		const changes = this.pending.get(event.queryRunner)
		this.pending.delete(event.queryRunner)
		if (changes) {
			await Promise.all(
				Array.from(changes.values(), ({ dependency, tenantId }) => this.cache.invalidate(dependency, tenantId))
			)
		}
	}

	afterTransactionRollback(event: TransactionRollbackEvent) {
		if (!event.queryRunner.isTransactionActive) this.pending.delete(event.queryRunner)
	}

	private async changed(event: ChangeEvent) {
		const dependency = entities.get(event.metadata.target)
		if (!dependency) return
		const entity: unknown = event.entity
		// Bulk events may have no tenant. Invalidate globally rather than guessing scope from the caller.
		// Updates can move a row across tenants, so both old and new scopes must be discarded.
		const tenantId = 'updatedColumns' in event ? undefined : readTenantId(entity, dependency)
		if (event.queryRunner.isTransactionActive) {
			let changes = this.pending.get(event.queryRunner)
			if (!changes) {
				changes = new Map()
				this.pending.set(event.queryRunner, changes)
			}
			changes.set(`${dependency}:${tenantId ?? '*'}`, { dependency, tenantId })
		} else {
			await this.cache.invalidate(dependency, tenantId)
		}
	}
}

function readTenantId(entity: unknown, dependency: CurrentUserCacheDependency): string | undefined {
	if (!entity || typeof entity !== 'object') return undefined
	const key = dependency === 'Tenant' ? 'id' : 'tenantId'
	const value: unknown = Reflect.get(entity, key)
	return typeof value === 'string' && value.length ? value : undefined
}
