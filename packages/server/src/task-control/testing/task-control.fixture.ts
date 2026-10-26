// Minimal related entities keep production base metadata in isolated task-control tests.
import { DataSource, Entity, PrimaryColumn } from 'typeorm'
import { ExecutionTaskControl } from '../task-control.entity'
import { TaskControlPublication } from '../task-control-publication.entity'

@Entity('user')
class User {
	@PrimaryColumn('uuid') id: string
}
@Entity('tenant')
class Tenant {
	@PrimaryColumn('uuid') id: string
}
@Entity('organization')
class Organization {
	@PrimaryColumn('uuid') id: string
}

export const taskControlScopeEntities = [User, Tenant, Organization]
export const taskControlTestEntities = [ExecutionTaskControl, TaskControlPublication, ...taskControlScopeEntities]

export async function seedTaskControlScope(
	database: DataSource,
	scope: { tenantId: string; organizationId?: string | null }
) {
	await database.createQueryBuilder().insert().into(Tenant).values({ id: scope.tenantId }).orIgnore().execute()
	if (scope.organizationId)
		await database
			.createQueryBuilder()
			.insert()
			.into(Organization)
			.values({ id: scope.organizationId })
			.orIgnore()
			.execute()
}

export async function createTaskControlScopeTables(database: DataSource) {
	for (const table of ['user', 'tenant', 'organization'])
		await database.query(`CREATE TABLE "${table}" (id uuid PRIMARY KEY)`)
}
