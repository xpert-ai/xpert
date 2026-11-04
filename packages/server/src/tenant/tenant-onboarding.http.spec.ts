import type { INestApplication } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import { TenantController } from './tenant.controller'
import { TenantService } from './tenant.service'
import { Tenant } from './tenant.entity'
import {
	ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY,
	AnonymousTenantResolverService,
	type AnonymousTenantResolution
} from './anonymous-tenant-resolver.service'
import { RoleGuard, TenantPermissionGuard } from '../shared/guards'

jest.mock('./tenant.service', () => ({ TenantService: class TenantService {} }))
jest.mock('./tenant.entity', () => ({ Tenant: class Tenant {} }))
jest.mock('./anonymous-tenant-resolver.service', () => ({
	ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY: 'anonymous-tenant-resolution',
	AnonymousTenantResolverService: class AnonymousTenantResolverService {}
}))
jest.mock('../core/crud', () => ({
	CrudController: class CrudController {
		constructor(_service: unknown) {}
	}
}))
jest.mock('../core/context/request-context', () => ({ RequestContext: {} }))
jest.mock('../shared/guards', () => ({
	RoleGuard: class RoleGuard {},
	TenantPermissionGuard: class TenantPermissionGuard {}
}))
jest.mock('../shared/pipes', () => ({ UUIDValidationPipe: class UUIDValidationPipe {} }))
jest.mock('../user/commands', () => ({ UserCreateCommand: class UserCreateCommand {} }))
jest.mock('../feature/commands', () => ({ FeatureBulkCreateCommand: class FeatureBulkCreateCommand {} }))
jest.mock('../language/commands', () => ({ LanguageInitCommand: class LanguageInitCommand {} }))

describe('tenant onboarding HTTP contract', () => {
	let app: INestApplication
	let origin: string
	let resolution: AnonymousTenantResolution
	let cachedResolution: AnonymousTenantResolution | undefined
	const resolve = jest.fn(async () => resolution)
	const initializedTenant = () =>
		Object.assign(new Tenant(), {
			id: 'tenant-local',
			name: 'Default Tenant',
			settings: [
				{ name: 'tenantLogo', value: 'logo.svg' },
				{ name: 'internalSetting', value: 'private-value' }
			]
		})
	const forTenant = (tenant: Tenant | null): AnonymousTenantResolution => ({
		tenant,
		tenantId: tenant?.id ?? null,
		tenantName: tenant?.name ?? null,
		organizationId: null,
		fallbackApplied: false
	})

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [TenantController],
			providers: [
				{ provide: TenantService, useValue: {} },
				{ provide: AnonymousTenantResolverService, useValue: { resolve } },
				{ provide: CommandBus, useValue: { execute: jest.fn() } }
			]
		})
			.overrideGuard(RoleGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(TenantPermissionGuard)
			.useValue({ canActivate: () => true })
			.compile()
		app = module.createNestApplication({ logger: false })
		app.use((request: Request, _response: Response, next: NextFunction) => {
			if (cachedResolution) request[ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY] = cachedResolution
			next()
		})
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	beforeEach(() => {
		resolution = forTenant(null)
		cachedResolution = undefined
		jest.clearAllMocks()
	})
	afterAll(async () => app?.close())

	it('returns parseable JSON null before the first tenant is initialized', async () => {
		const response = await fetch(`${origin}/onboard`)
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toMatch(/application\/json/)
		expect(await response.json()).toBeNull()
	})
	it('preserves the initialized tenant shape and filters internal settings', async () => {
		resolution = forTenant(initializedTenant())
		const response = await fetch(`${origin}/onboard`)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({
			id: 'tenant-local',
			name: 'Default Tenant',
			settings: [{ name: 'tenantLogo', value: 'logo.svg' }]
		})
	})

	it('uses the trusted request resolution without resolving the tenant twice', async () => {
		cachedResolution = forTenant(initializedTenant())
		const response = await fetch(`${origin}/onboard`)
		expect(await response.json()).toMatchObject({ id: 'tenant-local' })
		expect(resolve).not.toHaveBeenCalled()
	})
})
