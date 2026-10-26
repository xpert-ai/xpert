import { DataSource, Entity, PrimaryColumn } from 'typeorm'
import { ExecutionControl } from '../execution-control.entity'

// Keep real inherited column/relation metadata while isolating unrelated platform entities.
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
export const executionControlTestEntities = [ExecutionControl, User, Tenant, Organization]

export async function seedExecutionControlScope(
    database: DataSource,
    scope: { tenantId: string; organizationId?: string | null }
) {
    await database.createQueryBuilder().insert().into('Tenant').values({ id: scope.tenantId }).orIgnore().execute()
    if (scope.organizationId)
        await database
            .createQueryBuilder()
            .insert()
            .into('Organization')
            .values({ id: scope.organizationId })
            .orIgnore()
            .execute()
}
