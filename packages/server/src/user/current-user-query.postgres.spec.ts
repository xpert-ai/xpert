import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import cls from 'cls-hooked'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, IsNull } from 'typeorm'
import { PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
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
const coreRelations = ['employee', 'role', 'role.rolePermissions', 'tenant']
const organizationRelations = ['organizations', 'organizations.organization']

;(url ? describe : describe.skip)('current-user feature query PostgreSQL compatibility', () => {
	const schema = `me_${randomUUID().replace(/-/g, '')}`
	const tenantId = randomUUID(),
		otherTenantId = randomUUID(),
		userId = randomUUID(),
		otherUserId = randomUUID()
	const roleId = randomUUID(),
		featureId = randomUUID(),
		foreignOrganizationId = randomUUID()
	const organizations = Array.from({ length: 615 }, (_, index) => ({
		id: randomUUID(),
		tenantId,
		name: `Organization ${index}`,
		isActive: index !== 1,
		isDefault: index === 0
	}))
	const memberships = organizations.map((organization, index) => ({
		id: randomUUID(),
		tenantId,
		userId,
		organizationId: organization.id,
		isActive: index !== 2,
		isDefault: index === 0,
		preferences: { defaultWorkspaceId: `fixture-${index}` }
	}))
	const namespace = cls.getNamespace('RequestContext') ?? cls.createNamespace('RequestContext')
	let db: DataSource, module: TestingModule, service: UserService
	const cache = new Map<string, unknown>()
	const cacheManager = {
		get: jest.fn(async (key: string) => cache.get(key)),
		set: jest.fn(async (key: string, value: unknown) => {
			cache.set(key, value)
		})
	}

	function scoped<T>(tenant: string, action: () => Promise<T>): Promise<T> {
		return namespace.runPromise(async () => {
			namespace.set('RequestContext', {
				request: { user: { id: userId, tenantId: tenant }, headers: { 'tenant-id': tenant } }
			})
			return action()
		})
	}
	function sorted(user: User) {
		return {
			...user,
			role: user.role && {
				...user.role,
				rolePermissions: [...user.role.rolePermissions].sort((a, b) => a.id.localeCompare(b.id))
			},
			organizations: [...user.organizations].sort((a, b) => a.id.localeCompare(b.id))
		}
	}

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
		await db.getRepository(User).insert([
			{ id: userId, tenantId, roleId, email: 'owner@example.invalid' },
			{ id: otherUserId, tenantId: otherTenantId, roleId, email: 'other@example.invalid' }
		])
		await db.getRepository(RolePermission).insert(
			Array.from({ length: 56 }, (_, index) => ({
				id: randomUUID(),
				tenantId,
				roleId,
				permission: PermissionsEnum.ALL_ORG_VIEW,
				enabled: index !== 1
			}))
		)
		await db
			.getRepository(Organization)
			.insert([
				...organizations,
				{ id: foreignOrganizationId, tenantId, name: 'Not a member', isActive: true, isDefault: false }
			])
		await db.getRepository(UserOrganization).insert(memberships)
		await db.getRepository(Feature).insert({ id: featureId, code: 'fixture-feature' })
		await db.getRepository(FeatureOrganization).insert([
			{ id: randomUUID(), tenantId, organizationId: null, featureId, isEnabled: true },
			{ id: randomUUID(), tenantId, organizationId: organizations[0].id, featureId, isEnabled: false },
			{ id: randomUUID(), tenantId, organizationId: foreignOrganizationId, featureId, isEnabled: true },
			{ id: randomUUID(), tenantId: otherTenantId, organizationId: null, featureId, isEnabled: true }
		])
		module = await Test.createTestingModule({
			providers: [
				UserService,
				EventEmitter2,
				{ provide: getRepositoryToken(User), useValue: db.getRepository(User) },
				{ provide: getRepositoryToken(EmailVerification), useValue: {} },
				{ provide: getRepositoryToken(FeatureOrganization), useValue: db.getRepository(FeatureOrganization) },
				{ provide: UserOrganizationService, useValue: {} },
				{ provide: CACHE_MANAGER, useValue: cacheManager }
			]
		}).compile()
		service = module.get(UserService)
	}, 30000)

	afterAll(async () => {
		await module?.close()
		if (db?.isInitialized) {
			try {
				await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
			} finally {
				await db.destroy()
			}
		}
	})
	beforeEach(() => {
		cache.clear()
		jest.clearAllMocks()
	})

	it(
		'preserves the joined response while loading organizations separately from permissions',
		async () =>
			scoped(tenantId, async () => {
				const oldStarted = performance.now()
				const expected = await service.findOne(userId, {
					relations: [...coreRelations, ...organizationRelations]
				})
				const oldMs = performance.now() - oldStarted
				expected.tenant.featureOrganizations = await db
					.getRepository(FeatureOrganization)
					.find({ where: { tenantId, organizationId: IsNull() }, relations: ['feature'] })
				const organizationFeatures = await db
					.getRepository(FeatureOrganization)
					.find({ where: { tenantId, organizationId: organizations[0].id }, relations: ['feature'] })
				for (const membership of expected.organizations) {
					membership.organization.featureOrganizations =
						membership.organizationId === organizations[0].id ? organizationFeatures : []
				}
				const querySpy = jest.spyOn(db.getRepository(User), 'findOne')
				const started = performance.now()
				const result = await service.findCurrentUser(userId, featureRelations)
				const splitMs = performance.now() - started
				expect(sorted(result)).toEqual(sorted(expected))
				expect(result.organizations).toHaveLength(615)
				expect(result.role.rolePermissions).toHaveLength(56)
				expect(result.organizations.find((item) => item.id === memberships[2].id).isActive).toBe(false)
				expect(result.organizations.find((item) => item.id === memberships[1].id).organization.isActive).toBe(
					false
				)
				for (const [options] of querySpy.mock.calls) {
					expect(options.where).toEqual({ id: userId, tenant: { id: tenantId } })
					expect(options.relations).not.toEqual(
						expect.arrayContaining(['role.rolePermissions', 'organizations'])
					)
				}
				expect(querySpy).toHaveBeenCalledTimes(2)
				querySpy.mockRestore()
				console.info(
					JSON.stringify({
						memberships: 615,
						permissions: 56,
						oldJoinMs: Math.round(oldMs),
						splitMs: Math.round(splitMs)
					})
				)
			}),
		30000
	)

	it('rejects a user outside the request tenant through the real scoped service', async () => {
		await expect(
			scoped(otherTenantId, () => service.findCurrentUser(userId, featureRelations))
		).rejects.toBeInstanceOf(NotFoundException)
		await expect(
			scoped(tenantId, () => service.findCurrentUser(otherUserId, featureRelations))
		).rejects.toBeInstanceOf(NotFoundException)
		expect(cacheManager.get).not.toHaveBeenCalled()
	})

	it('refreshes permissions and membership on cache hits without restoring removed organizations', async () =>
		scoped(tenantId, async () => {
			const first = await service.findCurrentUser(userId, featureRelations)
			await db.getRepository(UserOrganization).delete(memberships[0].id)
			await db.getRepository(RolePermission).update({ roleId }, { enabled: false })
			try {
				const cached = await service.findCurrentUser(userId, featureRelations)
				expect(cached.organizations).toHaveLength(614)
				expect(cached.organizations.some((item) => item.organizationId === organizations[0].id)).toBe(false)
				expect(cached.role.rolePermissions.every((item) => !item.enabled)).toBe(true)
				expect(cached.tenant.featureOrganizations).toEqual(first.tenant.featureOrganizations)
			} finally {
				await db.getRepository(UserOrganization).insert(memberships[0])
			}
		}))

	it('keeps the no-membership response empty and the feature query tenant scoped', async () => {
		const result = await scoped(otherTenantId, () => service.findCurrentUser(otherUserId, featureRelations))
		expect(result.organizations).toEqual([])
		expect(result.tenant.featureOrganizations).toHaveLength(1)
		expect(result.tenant.featureOrganizations[0].tenantId).toBe(otherTenantId)
	})

	it('preserves a membership whose organization is null', async () =>
		scoped(tenantId, async () => {
			const membershipId = randomUUID()
			await db.getRepository(UserOrganization).insert({
				id: membershipId,
				tenantId,
				userId,
				organizationId: null,
				isActive: false,
				isDefault: false,
				preferences: { defaultWorkspaceId: 'preserved-preference' }
			})
			try {
				const result = await service.findCurrentUser(userId, featureRelations)
				expect(result.organizations.find((membership) => membership.id === membershipId)).toMatchObject({
					organization: null,
					isActive: false,
					preferences: { defaultWorkspaceId: 'preserved-preference' }
				})
			} finally {
				await db.getRepository(UserOrganization).delete(membershipId)
			}
		}))

	it('does not return a partial user if the second scoped read can no longer find it', async () =>
		scoped(tenantId, async () => {
			const findOne = service.findOne.bind(service)
			const read = jest.spyOn(service, 'findOne').mockImplementationOnce(async (...args) => {
				const user = await findOne(...args)
				await db.getRepository(User).softDelete(userId)
				return user
			})
			try {
				await expect(service.findCurrentUser(userId, featureRelations)).rejects.toBeInstanceOf(
					NotFoundException
				)
				expect(cacheManager.get).not.toHaveBeenCalled()
			} finally {
				read.mockRestore()
				await db.getRepository(User).restore(userId)
			}
		}))
})
