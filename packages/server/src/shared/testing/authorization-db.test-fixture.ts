// Exercise real TypeORM relation loading without external services or application schema migrations.
import { UserType } from '@xpert-ai/contracts'
import { DataSource, EntitySchema, EntitySchemaColumnOptions } from 'typeorm'
import { ApiKey } from '../../api-key/api-key.entity'
import { Employee } from '../../employee/employee.entity'
import { Organization } from '../../organization/organization.entity'
import { RolePermission } from '../../role-permission/role-permission.entity'
import { Role } from '../../role/role.entity'
import { Tag } from '../../tags/tag.entity'
import { UserOrganization } from '../../user-organization/user-organization.entity'
import { User } from '../../user/user.entity'

const id: EntitySchemaColumnOptions = { type: String, primary: true }
const text: EntitySchemaColumnOptions = { type: String, nullable: true }
const scope = { id, tenantId: { type: String }, organizationId: text }

export async function createAuthorizationDatabase() {
	return new DataSource({
		type: 'sqljs',
		driver: require('sql.js'),
		synchronize: true,
		entities: [
			new EntitySchema<User>({
				name: 'User',
				target: User,
				tableName: 'user',
				columns: {
					id,
					tenantId: { type: String },
					type: { type: String },
					roleId: text,
					isActive: { type: Boolean, default: true },
					deletedAt: { type: Date, nullable: true, deleteDate: true },
					hash: text,
					refreshToken: text,
					preferredLanguage: text,
					firstName: text,
					lastName: text,
					username: text,
					email: text,
					imageUrl: text,
					timeZone: text,
					emailVerified: { type: Boolean, default: false }
				},
				relations: {
					role: { type: 'many-to-one', target: 'Role', joinColumn: { name: 'roleId' }, nullable: true },
					employee: { type: 'one-to-one', target: 'Employee', inverseSide: 'user' }
				}
			}),
			new EntitySchema<Role>({
				name: 'Role',
				target: Role,
				tableName: 'role',
				columns: { id, tenantId: { type: String }, name: { type: String } },
				relations: { rolePermissions: { type: 'one-to-many', target: 'RolePermission', inverseSide: 'role' } }
			}),
			new EntitySchema<RolePermission>({
				name: 'RolePermission',
				target: RolePermission,
				tableName: 'role_permission',
				columns: {
					id,
					tenantId: { type: String },
					roleId: { type: String },
					permission: { type: String },
					enabled: { type: Boolean }
				},
				relations: { role: { type: 'many-to-one', target: 'Role', joinColumn: { name: 'roleId' } } }
			}),
			new EntitySchema<Employee>({
				name: 'Employee',
				target: Employee,
				tableName: 'employee',
				columns: { id, userId: { type: String } },
				relations: { user: { type: 'one-to-one', target: 'User', joinColumn: { name: 'userId' } } }
			}),
			new EntitySchema<ApiKey>({
				name: 'ApiKey',
				target: ApiKey,
				tableName: 'api_key',
				columns: {
					...scope,
					token: { type: String },
					type: text,
					entityId: text,
					name: text,
					userId: text,
					createdById: text,
					validUntil: { type: Date, nullable: true },
					revokedAt: { type: Date, nullable: true },
					lastUsedAt: { type: Date, nullable: true }
				},
				relations: {
					user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' }, nullable: true },
					createdBy: {
						type: 'many-to-one',
						target: 'User',
						joinColumn: { name: 'createdById' },
						nullable: true
					}
				}
			}),
			new EntitySchema<Organization>({
				name: 'Organization',
				target: Organization,
				tableName: 'organization',
				columns: { id, tenantId: { type: String }, name: text, isActive: { type: Boolean, default: true } }
			}),
			new EntitySchema<UserOrganization>({
				name: 'UserOrganization',
				target: UserOrganization,
				tableName: 'user_organization',
				columns: { ...scope, userId: { type: String }, isActive: { type: Boolean, default: true } },
				relations: {
					organization: {
						type: 'many-to-one',
						target: 'Organization',
						joinColumn: { name: 'organizationId' }
					}
				}
			}),
			new EntitySchema<Tag>({
				name: 'Tag',
				target: Tag,
				tableName: 'tag',
				columns: {
					...scope,
					name: { type: String },
					description: text,
					category: text,
					color: text,
					icon: text,
					label: { type: 'simple-json', nullable: true },
					targets: { type: 'simple-json', nullable: true },
					isActive: { type: Boolean, default: true },
					isSystem: { type: Boolean, default: false },
					createdById: text,
					updatedById: text
				},
				relations: { users: { type: 'many-to-many', target: 'User', joinTable: true } }
			})
		]
	}).initialize()
}

export async function seedAuthorizationDatabase(db: DataSource) {
	await db.getRepository(Role).save([
		{ id: 'reader-role', tenantId: 'tenant-a', name: 'DATA_ENTRY' },
		{ id: 'manager-role', tenantId: 'tenant-a', name: 'CUSTOM_MANAGER' }
	])
	await db.getRepository(RolePermission).save([
		{ id: 'chat-grant', tenantId: 'tenant-a', roleId: 'reader-role', permission: 'CHAT_VIEW', enabled: true },
		{ id: 'tag-grant', tenantId: 'tenant-a', roleId: 'manager-role', permission: 'ORG_TAGS_EDIT', enabled: true }
	])
	await db.getRepository(User).save([
		{
			id: 'reader',
			tenantId: 'tenant-a',
			type: UserType.USER,
			roleId: 'reader-role',
			hash: 'fixture-password-hash',
			refreshToken: 'fixture-refresh-token'
		},
		{ id: 'manager', tenantId: 'tenant-a', type: UserType.USER, roleId: 'manager-role' },
		{ id: 'technical', tenantId: 'tenant-a', type: UserType.COMMUNICATION },
		{ id: 'foreign', tenantId: 'tenant-b', type: UserType.USER }
	])
	await db.getRepository(Organization).save([
		{ id: 'org-a', tenantId: 'tenant-a' },
		{ id: 'org-other', tenantId: 'tenant-a' },
		{ id: 'org-foreign', tenantId: 'tenant-b' }
	])
	await db.getRepository(UserOrganization).save(
		['reader', 'manager', 'technical'].map((userId) => ({
			id: userId,
			tenantId: 'tenant-a',
			organizationId: 'org-a',
			userId
		}))
	)
}
