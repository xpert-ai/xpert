// Minimal schemas for the real execution identity handlers, including their explicit projection.
import { Organization, Role, RolePermission, User, UserOrganization } from '@xpert-ai/server-core'
import { EntitySchema } from 'typeorm'

const id = { type: 'uuid' as const, primary: true, generated: 'uuid' as const }
const uuid = { type: 'uuid' as const, nullable: true }
const text = { type: 'varchar' as const, nullable: true }
const active = { type: 'boolean' as const, default: true }

export const executionIdentityPostgresEntities = [
    new EntitySchema<Organization>({
        name: 'Organization',
        target: Organization,
        columns: { id, tenantId: uuid, isActive: active }
    }),
    new EntitySchema<Role>({
        name: 'Role',
        target: Role,
        columns: { id, tenantId: uuid, name: text },
        relations: { rolePermissions: { type: 'one-to-many', target: 'RolePermission', inverseSide: 'role' } }
    }),
    new EntitySchema<RolePermission>({
        name: 'RolePermission',
        target: RolePermission,
        columns: { id, tenantId: uuid, roleId: uuid, permission: text, enabled: active },
        relations: { role: { type: 'many-to-one', target: 'Role', joinColumn: { name: 'roleId' } } }
    }),
    new EntitySchema({ name: 'Employee', columns: { id } }),
    new EntitySchema<User>({
        name: 'User',
        target: User,
        columns: {
            id,
            tenantId: uuid,
            type: text,
            roleId: uuid,
            isActive: active,
            preferredLanguage: text,
            firstName: text,
            lastName: text,
            username: text,
            email: text,
            emailVerified: active,
            imageUrl: text,
            timeZone: text
        },
        relations: {
            role: { type: 'many-to-one', target: 'Role', joinColumn: { name: 'roleId' } },
            employee: { type: 'one-to-one', target: 'Employee', joinColumn: true }
        }
    }),
    new EntitySchema<UserOrganization>({
        name: 'UserOrganization',
        target: UserOrganization,
        columns: { id, tenantId: uuid, organizationId: uuid, userId: uuid, isActive: active },
        relations: {
            organization: { type: 'many-to-one', target: 'Organization', joinColumn: { name: 'organizationId' } }
        }
    })
]
