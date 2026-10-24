import { EntitySchema } from 'typeorm'
import { User } from './user.entity'
import { Tenant } from '../tenant/tenant.entity'
import { Role } from '../role/role.entity'
import { RolePermission } from '../role-permission/role-permission.entity'
import { Employee } from '../employee/employee.entity'
import { Organization } from '../organization/organization.entity'
import { UserOrganization } from '../user-organization/user-organization.entity'
import { Feature } from '../feature/feature.entity'
import { FeatureOrganization } from '../feature/feature-organization.entity'

const id = { type: 'uuid', primary: true } as const
const tenantId = { type: 'uuid', nullable: true } as const

export const currentUserQueryEntities = [
	new EntitySchema<Tenant>({ name: 'Tenant', target: Tenant, columns: { id, name: { type: 'text' } } }),
	new EntitySchema<Role>({
		name: 'Role',
		target: Role,
		columns: { id, tenantId, name: { type: 'text' } },
		relations: { rolePermissions: { type: 'one-to-many', target: 'RolePermission', inverseSide: 'role' } }
	}),
	new EntitySchema<RolePermission>({
		name: 'RolePermission',
		target: RolePermission,
		columns: { id, tenantId, roleId: { type: 'uuid' }, permission: { type: 'text' }, enabled: { type: 'boolean' } },
		relations: { role: { type: 'many-to-one', target: 'Role', joinColumn: { name: 'roleId' } } },
		relationIds: { roleId: { relationName: 'role' } }
	}),
	new EntitySchema<User>({
		name: 'User',
		target: User,
		columns: {
			id,
			tenantId,
			roleId: { type: 'uuid' },
			email: { type: 'text' },
			deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true }
		},
		relations: {
			tenant: { type: 'many-to-one', target: 'Tenant', joinColumn: { name: 'tenantId' } },
			role: { type: 'many-to-one', target: 'Role', joinColumn: { name: 'roleId' } },
			employee: { type: 'one-to-one', target: 'Employee', inverseSide: 'user' },
			organizations: { type: 'one-to-many', target: 'UserOrganization', inverseSide: 'user' }
		},
		relationIds: { tenantId: { relationName: 'tenant' }, roleId: { relationName: 'role' } }
	}),
	new EntitySchema<Employee>({
		name: 'Employee',
		target: Employee,
		columns: { id, tenantId, userId: { type: 'uuid' } },
		relations: { user: { type: 'one-to-one', target: 'User', joinColumn: { name: 'userId' } } }
	}),
	new EntitySchema<Organization>({
		name: 'Organization',
		target: Organization,
		columns: { id, tenantId, name: { type: 'text' }, isActive: { type: 'boolean' }, isDefault: { type: 'boolean' } }
	}),
	new EntitySchema<UserOrganization>({
		name: 'UserOrganization',
		target: UserOrganization,
		columns: {
			id,
			tenantId,
			userId: { type: 'uuid' },
			organizationId: { type: 'uuid', nullable: true },
			isActive: { type: 'boolean' },
			isDefault: { type: 'boolean' },
			preferences: { type: 'json', nullable: true }
		},
		relations: {
			tenant: { type: 'many-to-one', target: 'Tenant', joinColumn: { name: 'tenantId' } },
			user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' } },
			organization: {
				type: 'many-to-one',
				target: 'Organization',
				joinColumn: { name: 'organizationId' },
				nullable: true
			}
		},
		relationIds: { userId: { relationName: 'user' }, organizationId: { relationName: 'organization' } }
	}),
	new EntitySchema<Feature>({ name: 'Feature', target: Feature, columns: { id, code: { type: 'text' } } }),
	new EntitySchema<FeatureOrganization>({
		name: 'FeatureOrganization',
		target: FeatureOrganization,
		columns: {
			id,
			tenantId,
			organizationId: { type: 'uuid', nullable: true },
			featureId: { type: 'uuid' },
			isEnabled: { type: 'boolean' }
		},
		relations: { feature: { type: 'many-to-one', target: 'Feature', joinColumn: { name: 'featureId' } } }
	})
]
