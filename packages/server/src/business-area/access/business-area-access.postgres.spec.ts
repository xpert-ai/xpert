jest.mock('../business-area.entity', () => ({ BusinessArea: class BusinessArea {} }))
jest.mock('../../user/user.entity', () => ({ User: class User {} }))
jest.mock('../../user-group/user-group.entity', () => ({ UserGroup: class UserGroup {} }))
jest.mock('./business-area-access.entity', () => ({ BusinessAreaAccessGrant: class BusinessAreaAccessGrant {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		currentTenantId: jest.fn(),
		requireOrganizationScope: jest.fn(),
		currentUserId: jest.fn(),
		hasPermission: jest.fn()
	}
}))
jest.mock('i18next', () => ({ t: (key: string) => key }))

import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType, UserGroupManagedByEnum } from '@xpert-ai/contracts'
import { BusinessArea } from '../business-area.entity'
import { User } from '../../user/user.entity'
import { UserGroup } from '../../user-group/user-group.entity'
import { BusinessAreaAccessGrant } from './business-area-access.entity'
import { BusinessAreaAccessService } from './business-area-access.service'
import { businessAreaAccessSql } from './business-area-access.sql'

const postgres = process.env.XPERT_BUSINESS_AREA_TEST_DATABASE_URL ? describe : describe.skip
const schema = `ba_${randomUUID().replace(/-/g, '')}`
const tenant = randomUUID(),
	org = randomUUID(),
	otherOrg = randomUUID()
const adminRole = randomUUID()
const admin = randomUUID(),
	alice = randomUUID(),
	outsider = randomUUID(),
	foreign = randomUUID()
const procurement = randomUUID(),
	finance = randomUUID(),
	child = randomUUID(),
	foreignArea = randomUUID()
const buyers = randomUUID(),
	accountants = randomUUID(),
	analysts = randomUUID(),
	managed = randomUUID(),
	foreignGroup = randomUUID()
const base = {
	id: { type: 'uuid', primary: true, generated: 'uuid' },
	tenantId: { type: 'uuid' },
	organizationId: { type: 'uuid' }
} as const

postgres('group and business-area authorization on PostgreSQL', () => {
	let db: DataSource, service: BusinessAreaAccessService
	const actor = (id: string) => {
		jest.mocked(RequestContext.currentTenantId).mockReturnValue(tenant)
		jest.mocked(RequestContext.requireOrganizationScope).mockReturnValue(org)
		jest.mocked(RequestContext.currentUserId).mockReturnValue(id)
		jest.mocked(RequestContext.hasPermission).mockReturnValue(id === admin)
	}
	beforeAll(async () => {
		db = await new DataSource({
			type: 'postgres',
			url: process.env.XPERT_BUSINESS_AREA_TEST_DATABASE_URL,
			schema,
			extra: { options: `-c search_path=${schema},public` },
			entities: [
				new EntitySchema<User>({
					name: 'BAUser',
					target: User,
					tableName: 'user',
					columns: {
						id: base.id,
						tenantId: base.tenantId,
						firstName: { type: 'varchar' },
						lastName: { type: 'varchar', default: '' },
						username: { type: 'varchar', default: '' },
						type: { type: 'varchar', default: UserType.USER },
						isActive: { type: 'boolean', default: true },
						roleId: { type: 'uuid', nullable: true },
						deletedAt: { type: 'timestamptz', nullable: true }
					},
					relations: {
						organizations: { type: 'one-to-many', target: 'BAOrganizationUser', inverseSide: 'user' }
					}
				}),
				new EntitySchema<{
					id: string
					tenantId: string
					organizationId: string
					userId: string
					isActive: boolean
					user: User
				}>({
					name: 'BAOrganizationUser',
					tableName: 'user_organization',
					columns: { ...base, userId: { type: 'uuid' }, isActive: { type: 'boolean', default: true } },
					relations: { user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' } } }
				}),
				new EntitySchema<UserGroup>({
					name: 'BAGroup',
					target: UserGroup,
					tableName: 'user_group',
					columns: { ...base, name: { type: 'varchar' }, managedBy: { type: 'varchar', nullable: true } },
					relations: {
						members: {
							type: 'many-to-many',
							target: 'User',
							joinTable: {
								name: 'user_group_to_user',
								joinColumn: { name: 'userGroupId' },
								inverseJoinColumn: { name: 'userId' }
							}
						}
					}
				}),
				new EntitySchema<BusinessArea>({
					name: 'BAArea',
					target: BusinessArea,
					tableName: 'business_area',
					columns: { ...base, name: { type: 'varchar' }, parentId: { type: 'uuid', nullable: true } }
				}),
				new EntitySchema<BusinessAreaAccessGrant>({
					name: 'BAGrant',
					target: BusinessAreaAccessGrant,
					tableName: 'business_area_access_grant',
					columns: {
						...base,
						businessAreaId: { type: 'uuid' },
						subjectType: { type: 'varchar' },
						userId: { type: 'uuid', nullable: true },
						userGroupId: { type: 'uuid', nullable: true },
						role: { type: 'varchar' },
						createdAt: { type: 'timestamptz', createDate: true },
						updatedAt: { type: 'timestamptz', updateDate: true },
						createdById: { type: 'uuid' },
						updatedById: { type: 'uuid' }
					},
					relations: {
						user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' } },
						userGroup: { type: 'many-to-one', target: 'UserGroup', joinColumn: { name: 'userGroupId' } }
					}
				})
			]
		}).initialize()
		await db.query(`CREATE SCHEMA "${schema}"`)
		await db.synchronize()
		await db.query(
			`CREATE TABLE role_permission ("roleId" uuid, "tenantId" uuid, permission varchar, enabled boolean)`
		)
		await db.query(`INSERT INTO role_permission VALUES ($1,$2,'BUSINESS_AREA_MANAGE',true)`, [adminRole, tenant])
		await db.getRepository(User).save(
			[admin, alice, outsider, foreign].map((id) => ({
				id,
				tenantId: tenant,
				roleId: id === admin ? adminRole : null,
				firstName: id === alice ? '采购财务兼任成员' : id
			}))
		)
		await db.getRepository('BAOrganizationUser').save(
			[admin, alice, outsider, foreign].map((userId) => ({
				tenantId: tenant,
				organizationId: userId === foreign ? otherOrg : org,
				userId
			}))
		)
		await db.getRepository(BusinessArea).save(
			[procurement, finance, child, foreignArea].map((id) => ({
				id,
				tenantId: tenant,
				organizationId: id === foreignArea ? otherOrg : org,
				name: id,
				parentId: id === child ? procurement : null
			}))
		)
		await db.getRepository(UserGroup).save(
			[buyers, accountants, analysts, managed, foreignGroup].map((id) => ({
				id,
				tenantId: tenant,
				organizationId: id === foreignGroup ? otherOrg : org,
				name: id,
				managedBy: id === managed ? UserGroupManagedByEnum.XPERT_SHARING : null,
				members: id === buyers || id === accountants ? [{ id: alice }] : []
			}))
		)
		service = new BusinessAreaAccessService(db.getRepository(BusinessAreaAccessGrant))
	})
	afterAll(async () => {
		if (db?.isInitialized) {
			await db.query(`DROP SCHEMA "${schema}" CASCADE`)
			await db.destroy()
		}
	})

	it('supports procurement publication, finance consumption and union/revocation without copied user grants', async () => {
		actor(admin)
		await service.upsert(procurement, { subjectType: 'user_group', userGroupId: buyers, role: 'publisher' })
		await service.upsert(finance, { subjectType: 'user_group', userGroupId: accountants, role: 'consumer' })
		await service.upsert(procurement, { subjectType: 'user_group', userGroupId: analysts, role: 'consumer' })
		actor(alice)
		await expect(service.assertAccess(procurement, 'publish')).resolves.toBeUndefined()
		await expect(service.assertAccess(finance, 'publish')).rejects.toMatchObject({ status: 403 })
		expect(await service.capabilities()).toEqual({
			view: expect.arrayContaining([procurement, finance]),
			publish: [procurement],
			manage: []
		})
		expect((await service.explain(procurement)).sources).toHaveLength(1)
		await db.createQueryBuilder().relation(UserGroup, 'members').of(analysts).add(alice)
		expect((await service.explain(procurement)).sources).toHaveLength(2)
		await db.createQueryBuilder().relation(UserGroup, 'members').of(buyers).remove(alice)
		await expect(service.assertAccess(procurement, 'view')).resolves.toBeUndefined()
		await expect(service.assertAccess(procurement, 'publish')).rejects.toMatchObject({ status: 403 })
		await db.createQueryBuilder().relation(UserGroup, 'members').of(analysts).remove(alice)
		await expect(service.assertAccess(procurement, 'view')).rejects.toMatchObject({ status: 403 })
		await expect(service.assertAccess(finance, 'view')).resolves.toBeUndefined()
		expect(await db.getRepository(BusinessAreaAccessGrant).countBy({ subjectType: 'user' })).toBe(0)
	})

	it('keeps direct grants independent, rejects outsiders and prevents hierarchy or organization inheritance', async () => {
		actor(admin)
		const direct = await service.upsert(procurement, { subjectType: 'user', userId: alice, role: 'consumer' })
		await expect(
			service.upsert(procurement, { subjectType: 'user', userId: foreign, role: 'consumer' })
		).rejects.toMatchObject({ status: 400 })
		for (const userGroupId of [managed, foreignGroup])
			await expect(
				service.upsert(procurement, { subjectType: 'user_group', userGroupId, role: 'consumer' })
			).rejects.toMatchObject({ status: 400 })
		actor(alice)
		await expect(service.assertAccess(procurement, 'view')).resolves.toBeUndefined()
		await expect(service.assertAccess(child, 'view')).rejects.toMatchObject({ status: 403 })
		await expect(service.assertAccess(foreignArea, 'view')).rejects.toMatchObject({ status: 404 })
		await expect(
			service.upsert(finance, { subjectType: 'user', userId: alice, role: 'publisher' })
		).rejects.toMatchObject({ status: 403 })
		actor(outsider)
		expect((await service.explain(procurement)).canView).toBe(false)
		actor(admin)
		await service.remove(procurement, direct.id)
		actor(alice)
		expect((await service.explain(procurement)).canView).toBe(false)
	})

	it('enforces the same predicates in resource lists and rejects an inactive organization member', async () => {
		actor(alice)
		const query = () =>
			db
				.getRepository(BusinessArea)
				.createQueryBuilder('area')
				.where(businessAreaAccessSql('area.id', ':tenantId', ':organizationId', ':userId'), {
					tenantId: tenant,
					organizationId: org,
					userId: alice
				})
				.getMany()
		expect((await query()).map((area) => area.id)).toEqual([finance])
		await db.getRepository('BAOrganizationUser').update({ userId: alice }, { isActive: false })
		expect(await query()).toEqual([])
		await expect(service.assertAccess(finance, 'view')).rejects.toMatchObject({ status: 403 })
	})
	it('explains a platform administrator to a scoped domain administrator without granting global management', async () => {
		await db.getRepository('BAOrganizationUser').update({ userId: alice }, { isActive: true })
		actor(admin)
		const delegated = await service.upsert(procurement, {
			subjectType: 'user',
			userId: alice,
			role: 'domain_admin'
		})
		actor(alice)
		expect(await service.explain(procurement, admin)).toMatchObject({
			platformManagement: true,
			canView: true,
			canPublish: true,
			canManage: true
		})
		await expect(
			service.upsert(finance, { subjectType: 'user', userId: alice, role: 'publisher' })
		).rejects.toMatchObject({ status: 403 })
		await service.remove(procurement, delegated.id)
		await db.getRepository(User).update(alice, { isActive: false })
		await expect(service.assertAccess(finance, 'view')).rejects.toMatchObject({ status: 403 })
	})
})
