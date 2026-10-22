import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import cls from 'cls-hooked'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { createCache } from 'cache-manager'
import Keyv from 'keyv'
import { instanceToPlain } from 'class-transformer'
import { DataSource } from 'typeorm'
import { NotFoundException } from '@nestjs/common'
import { PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { als, RequestContext } from '@xpert-ai/plugin-sdk'
import { UserService } from './user.service'
import { User } from './user.entity'
import { EmailVerification } from './email-verification/email-verification.entity'
import { UserOrganizationService } from '../user-organization/user-organization.services'
import { UserOrganization } from '../user-organization/user-organization.entity'
import { Tenant } from '../tenant/tenant.entity'
import { Role } from '../role/role.entity'
import { RolePermission } from '../role-permission/role-permission.entity'
import { Organization } from '../organization/organization.entity'
import { Feature } from '../feature/feature.entity'
import { FeatureOrganization } from '../feature/feature-organization.entity'
import { currentUserQueryEntities } from './current-user-query.test-fixture'
import { CurrentUserCacheService } from './current-user-cache.service'
import { CurrentUserCacheSubscriber } from './current-user-cache.subscriber'

const url = process.env.XPERT_ME_TEST_DATABASE_URL
if (url && !/^\/xpert_me_test(?:_[a-z0-9_]+)?$/.test(new URL(url).pathname)) {
	throw new Error('A dedicated current-user integration test database is required')
}
const featureRelations = [
	'tenant.featureOrganizations',
	'tenant.featureOrganizations.feature',
	'organizations.organization.featureOrganizations',
	'organizations.organization.featureOrganizations.feature'
]

;(url ? describe : describe.skip)('current-user display cache with PostgreSQL', () => {
	const schema = `me_cache_${randomUUID().replace(/-/g, '')}`
	const tenantId = randomUUID(),
		otherTenantId = randomUUID(),
		userId = randomUUID(),
		roleId = randomUUID()
	const organizationId = randomUUID(),
		membershipId = randomUUID(),
		permissionId = randomUUID(),
		featureId = randomUUID()
	const cache = createCache({ stores: [new Keyv()] })
	const namespace = cls.getNamespace('RequestContext') ?? cls.createNamespace('RequestContext')
	let db: DataSource, module: TestingModule, service: UserService, displayCache: CurrentUserCacheService

	function scoped<T>(action: () => Promise<T>, tenant = tenantId, id = userId, principalType?: string) {
		return namespace.runPromise(async () => {
			const request = Object.assign(new IncomingMessage(new Socket()), {
				user: { id, tenantId: tenant, principalType },
				headers: { 'tenant-id': tenant }
			})
			// Match the API's legacy CRUD context and SDK context during the migration.
			namespace.set('RequestContext', { request })
			return als.run(new RequestContext(request, new ServerResponse(request), 'me-cache-test'), action)
		})
	}
	const me = () => scoped(() => service.findCurrentUser(userId, featureRelations))
	const wire = (user: User) => JSON.stringify(instanceToPlain(user))

	beforeAll(async () => {
		db = new DataSource({ type: 'postgres', url, schema, entities: currentUserQueryEntities, synchronize: false })
		await db.initialize()
		await db.query(`CREATE SCHEMA "${schema}"`)
		await db.synchronize()
		await db.getRepository(Tenant).insert([
			{ id: tenantId, name: 'Own tenant' },
			{ id: otherTenantId, name: 'Other tenant' }
		])
		await db.getRepository(Role).insert({ id: roleId, tenantId, name: RolesEnum.ADMIN })
		await db.getRepository(User).insert({ id: userId, tenantId, roleId, email: 'cache@example.invalid' })
		await db
			.getRepository(RolePermission)
			.insert({ id: permissionId, tenantId, roleId, permission: PermissionsEnum.ALL_ORG_VIEW, enabled: true })
		await db
			.getRepository(Organization)
			.insert({ id: organizationId, tenantId, name: 'Original', isActive: true, isDefault: true })
		await db
			.getRepository(UserOrganization)
			.insert({ id: membershipId, tenantId, userId, organizationId, isActive: true, isDefault: true })
		await db.getRepository(Feature).insert({ id: featureId, code: 'cache-feature' })
		await db
			.getRepository(FeatureOrganization)
			.insert({ id: randomUUID(), tenantId, organizationId, featureId, isEnabled: true })
		module = await Test.createTestingModule({
			providers: [
				UserService,
				EventEmitter2,
				CurrentUserCacheService,
				CurrentUserCacheSubscriber,
				{ provide: DataSource, useValue: db },
				{ provide: CACHE_MANAGER, useValue: cache },
				{ provide: getRepositoryToken(User), useValue: db.getRepository(User) },
				{ provide: getRepositoryToken(EmailVerification), useValue: {} },
				{ provide: getRepositoryToken(FeatureOrganization), useValue: db.getRepository(FeatureOrganization) },
				{
					provide: UserOrganizationService,
					useValue: new UserOrganizationService(
						db.getRepository(UserOrganization),
						new EventEmitter2(),
						cache
					)
				}
			]
		}).compile()
		service = module.get(UserService)
		displayCache = module.get(CurrentUserCacheService)
	}, 30000)

	beforeEach(async () => {
		await cache.clear()
		jest.restoreAllMocks()
	})
	afterAll(async () => {
		await module?.close()
		await cache.disconnect()
		if (db?.isInitialized) {
			try {
				await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
			} finally {
				await db.destroy()
			}
		}
	})

	it('serves an identical serialized response without repeating either user join', async () => {
		const query = jest.spyOn(db.getRepository(User), 'findOne')
		const first = await me()
		expect(query).toHaveBeenCalledTimes(2)
		query.mockClear()
		const second = await me()
		expect(wire(second)).toBe(wire(first))
		expect(query).not.toHaveBeenCalled()
		const peerModule = await Test.createTestingModule({
			providers: [CurrentUserCacheService, { provide: CACHE_MANAGER, useValue: cache }]
		}).compile()
		try {
			const peer = peerModule.get(CurrentUserCacheService)
			const reload = jest.fn(async () => first)
			const peerResult = await peer.read(
				'core',
				tenantId,
				userId,
				{
					relations: ['employee', 'role', 'role.rolePermissions', 'tenant']
				},
				reload
			)
			expect(peerResult.id).toBe(userId)
			expect(reload).not.toHaveBeenCalled()
		} finally {
			await peerModule.close()
		}
		second.organizations.length = 0
		expect((await me()).organizations).toHaveLength(1)
		// Authentication still goes through the original fresh scoped query.
		await scoped(() => service.getIfExists(userId))
		expect(query).toHaveBeenCalledTimes(1)
	})

	it('does not reuse a warmed entry across tenants or for API principals', async () => {
		await me()
		await expect(
			scoped(() => service.findCurrentUser(userId, featureRelations), otherTenantId)
		).rejects.toBeInstanceOf(NotFoundException)
		const query = jest.spyOn(db.getRepository(User), 'findOne')
		await scoped(() => service.findCurrentUser(userId, featureRelations), tenantId, userId, 'api_key')
		expect(query).toHaveBeenCalledTimes(2)
	})

	it('shares versions across service instances and invalidates permission changes after commit', async () => {
		const peer = new CurrentUserCacheService(cache)
		const before = await peer.version('core', tenantId)
		await me()
		await db.transaction(async (manager) => {
			await manager.getRepository(RolePermission).update(permissionId, { enabled: false })
			expect(await peer.version('core', tenantId)).toBe(before)
			expect((await me()).role.rolePermissions[0].enabled).toBe(true)
		})
		expect(await peer.version('core', tenantId)).not.toBe(before)
		expect((await me()).role.rolePermissions[0].enabled).toBe(false)
		await db.getRepository(RolePermission).update(permissionId, { enabled: true })
	})

	it('does not publish invalidation for a rolled-back transaction', async () => {
		await me()
		const before = await displayCache.version('core', tenantId)
		await expect(
			db.transaction(async (manager) => {
				await manager.getRepository(RolePermission).update(permissionId, { enabled: false })
				throw new Error('rollback fixture')
			})
		).rejects.toThrow('rollback fixture')
		expect(await displayCache.version('core', tenantId)).toBe(before)
		expect((await me()).role.rolePermissions[0].enabled).toBe(true)
	})

	it('refreshes organization details, member removal, rejoining and feature updates', async () => {
		await me()
		await db.getRepository(Organization).update(organizationId, { name: 'Renamed', isActive: false })
		let user = await me()
		expect(user.organizations[0].organization).toMatchObject({ name: 'Renamed', isActive: false })
		await db.getRepository(FeatureOrganization).update({ organizationId }, { isEnabled: false })
		user = await me()
		expect(user.organizations[0].organization.featureOrganizations[0].isEnabled).toBe(false)
		const membership = await db.getRepository(UserOrganization).findOneByOrFail({ id: membershipId })
		await db.getRepository(UserOrganization).delete(membershipId)
		expect((await me()).organizations).toEqual([])
		await db.getRepository(UserOrganization).insert(membership)
		expect((await me()).organizations).toHaveLength(1)
		await db.getRepository(Organization).update(organizationId, { isActive: true })
	})

	it('invalidates profile edits, role replacement and soft deletion/recovery', async () => {
		await me()
		await db.getRepository(User).update(userId, { email: 'changed@example.invalid' })
		expect((await me()).email).toBe('changed@example.invalid')
		const newRoleId = randomUUID()
		await db.getRepository(Role).insert({ id: newRoleId, tenantId, name: RolesEnum.VIEWER })
		await db.getRepository(User).update(userId, { roleId: newRoleId })
		expect((await me()).role.rolePermissions).toEqual([])
		await db.getRepository(User).update(userId, { roleId })
		await db.getRepository(User).softDelete(userId)
		await expect(me()).rejects.toBeInstanceOf(NotFoundException)
		await db.getRepository(User).restore(userId)
		expect((await me()).id).toBe(userId)
	})

	it('keeps select fields and current-organization bootstrap results in separate entries', async () => {
		const organizations = ['organizations', 'organizations.organization']
		const full = await me()
		const selected = await scoped(() => service.findCurrentUser(userId, [], { select: { id: true } }))
		expect(selected.email).toBeUndefined()
		expect((await me()).tenant).toEqual(full.tenant)
		const bootstrap = await scoped(() =>
			service.findCurrentUser(userId, organizations, {
				limitOrganizations: true,
				currentOrganizationId: organizationId
			})
		)
		expect(bootstrap.organizations).toHaveLength(1)
		await db.getRepository(UserOrganization).update(membershipId, { isActive: false })
		try {
			const refreshed = await scoped(() =>
				service.findCurrentUser(userId, organizations, {
					limitOrganizations: true,
					currentOrganizationId: organizationId
				})
			)
			expect(refreshed.organizations).toEqual([])
			expect((await me()).organizations[0].isActive).toBe(false)
		} finally {
			await db.getRepository(UserOrganization).update(membershipId, { isActive: true })
		}
	})

	it('falls back to scoped queries when display cache reads fail', async () => {
		jest.spyOn(cache, 'mget').mockRejectedValue(new Error('cache unavailable'))
		jest.spyOn(cache, 'get').mockRejectedValue(new Error('cache unavailable'))
		const query = jest.spyOn(db.getRepository(User), 'findOne')
		await me()
		await me()
		expect(query).toHaveBeenCalledTimes(4)
	})

	it('does not reuse features loaded from an older membership snapshot after a concurrent join', async () => {
		const newOrganizationId = randomUUID(),
			newMembershipId = randomUUID(),
			newFeatureId = randomUUID()
		const read = displayCache.read.bind(displayCache)
		let joined = false
		const readSpy = jest.spyOn(displayCache, 'read').mockImplementation(async (...args) => {
			const result = await read(...args)
			if (args[0] === 'organizations' && !joined) {
				joined = true
				await db.getRepository(Organization).insert({
					id: newOrganizationId,
					tenantId,
					name: 'Concurrent join',
					isActive: true,
					isDefault: false
				})
				await db.getRepository(FeatureOrganization).insert({
					id: newFeatureId,
					tenantId,
					organizationId: newOrganizationId,
					featureId,
					isEnabled: true
				})
				await db.getRepository(UserOrganization).insert({
					id: newMembershipId,
					tenantId,
					userId,
					organizationId: newOrganizationId,
					isActive: true,
					isDefault: false
				})
			}
			return result
		})
		try {
			const olderSnapshot = await me()
			expect(olderSnapshot.organizations).toHaveLength(1)
			const current = await me()
			expect(current.organizations).toHaveLength(2)
			expect(
				current.organizations.find((item) => item.organizationId === newOrganizationId).organization
					.featureOrganizations[0].id
			).toBe(newFeatureId)
		} finally {
			readSpy.mockRestore()
			await db.getRepository(UserOrganization).delete(newMembershipId)
			await db.getRepository(FeatureOrganization).delete(newFeatureId)
			await db.getRepository(Organization).delete(newOrganizationId)
		}
	})

	it('avoids both joins with 615 memberships and 56 permissions', async () => {
		const organizations = Array.from({ length: 614 }, () => ({
			id: randomUUID(),
			tenantId,
			name: 'Cache scale fixture',
			isActive: true,
			isDefault: false
		}))
		await db.getRepository(Organization).insert(organizations)
		await db.getRepository(UserOrganization).insert(
			organizations.map((organization) => ({
				id: randomUUID(),
				tenantId,
				userId,
				organizationId: organization.id,
				isActive: true,
				isDefault: false
			}))
		)
		await db.getRepository(RolePermission).insert(
			Array.from({ length: 55 }, () => ({
				id: randomUUID(),
				tenantId,
				roleId,
				permission: PermissionsEnum.ALL_ORG_VIEW,
				enabled: true
			}))
		)
		const start = performance.now()
		const cold = await me()
		const coldMs = performance.now() - start
		const query = jest.spyOn(db.getRepository(User), 'findOne')
		const warmStart = performance.now()
		const warm = await me()
		const warmMs = performance.now() - warmStart
		expect(warm.organizations).toHaveLength(615)
		expect(warm.role.rolePermissions).toHaveLength(56)
		expect(wire(warm)).toBe(wire(cold))
		expect(query).not.toHaveBeenCalled()
		console.info(
			JSON.stringify({
				memberships: 615,
				permissions: 56,
				cacheColdMs: Math.round(coldMs),
				cacheWarmMs: Math.round(warmMs)
			})
		)
	}, 30000)
})
