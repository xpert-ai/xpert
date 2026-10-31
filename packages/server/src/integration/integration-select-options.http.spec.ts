import { type INestApplication } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IntegrationStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { RequestScopeLevel, RolesEnum } from '@xpert-ai/contracts'
import { UserService } from '../user'
import { PermissionGuard } from '../shared/guards/permission.guard'
import { IntegrationController } from './integration.controller'
import { IntegrationSharingController } from './sharing/integration-sharing.controller'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'

jest.mock('../core/context', () => ({ RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext }))
const orgA = '11111111-1111-4111-8111-111111111111'
const orgB = '22222222-2222-4222-8222-222222222222'
const sharedId = '33333333-3333-4333-8333-333333333333'

describe('integration discovery and sharing HTTP contract', () => {
	let app: INestApplication
	let origin: string
	let organizationId: string | null = orgA
	let admin = false
	const commands = { execute: jest.fn() }
	const shared = Object.assign(new Integration(), {
		id: sharedId,
		name: 'Shared',
		provider: 'fixture',
		tenantId: 'tenant',
		organizationId: null,
		sharing: { visibility: 'selected-organizations', organizationIds: [orgA], usages: ['bind'] },
		options: { secret: 'never-expose' }
	})
	const rows = [
		shared,
		Object.assign(new Integration(), {
			id: 'own',
			name: 'Own',
			provider: 'fixture',
			tenantId: 'tenant',
			organizationId: orgA
		}),
		Object.assign(new Integration(), {
			id: 'other',
			name: 'Other',
			provider: 'fixture',
			tenantId: 'tenant',
			organizationId: orgB
		}),
		Object.assign(new Integration(), {
			id: 'foreign',
			name: 'Foreign',
			provider: 'fixture',
			tenantId: 'foreign',
			organizationId: null
		}),
		Object.assign(new Integration(), {
			id: 'private',
			name: 'Private',
			provider: 'fixture',
			tenantId: 'tenant',
			organizationId: null
		})
	]
	const repository = {
		find: jest.fn(async () => rows),
		findOne: jest.fn(async () => shared),
		update: jest.fn(async (_criteria, patch) => {
			Object.assign(shared, patch)
			return { affected: 1 }
		}),
		manager: { count: jest.fn(async () => 1) }
	}
	beforeAll(async () => {
		jest.spyOn(RequestContext, 'getScope').mockImplementation(() => ({
			tenantId: 'tenant',
			organizationId,
			level: organizationId ? RequestScopeLevel.ORGANIZATION : RequestScopeLevel.TENANT
		}))
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
		jest.spyOn(RequestContext, 'hasRole').mockImplementation((role) => role === RolesEnum.SUPER_ADMIN && admin)
		const module = await Test.createTestingModule({
			controllers: [IntegrationSharingController, IntegrationController],
			providers: [
				IntegrationService,
				{ provide: getRepositoryToken(Integration), useValue: repository },
				{
					provide: IntegrationStrategyRegistry,
					useValue: { list: () => [{ meta: { name: 'fixture', avatar: 'fixture.svg' } }] }
				},
				{ provide: UserService, useValue: {} },
				{ provide: CommandBus, useValue: commands }
			]
		})
			.overrideGuard(PermissionGuard)
			.useValue({ canActivate: () => true })
			.compile()
		app = module.createNestApplication({ logger: false })
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	beforeEach(() => {
		organizationId = orgA
		admin = false
		shared.sharing = { visibility: 'selected-organizations', organizationIds: [orgA], usages: ['bind'] }
		jest.clearAllMocks()
		commands.execute.mockResolvedValue({ id: 'user' })
	})
	afterAll(async () => {
		await app?.close()
		jest.restoreAllMocks()
	})
	it('combines authorized tenant entries with own organization without credentials', async () => {
		const response = await fetch(`${origin}/available?usage=bind`)
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.map((item: { id: string }) => item.id)).toEqual([sharedId, 'own'])
		expect(JSON.stringify(data)).not.toContain('secret')
		expect(data[0].scopeLevel).toBe('tenant')
	})
	it('uses the same purpose policy in the legacy selector and direct runtime reads', async () => {
		expect(
			(await (await fetch(`${origin}/select-options?usage=invoke`)).json()).map((item: { id: string }) => item.id)
		).toEqual(['own'])
		const service = app.get(IntegrationService)
		expect(await service.readForUsage(sharedId, 'invoke', RequestContext.getScope())).toBeNull()
		expect(await service.readForUsage(sharedId, 'bind', RequestContext.getScope())).toBe(shared)
	})
	it('defaults to invoke and keeps tenantOnly constrained by configuration grants', async () => {
		const ids = async (path: string) =>
			(await (await fetch(`${origin}/${path}`)).json()).map((item: { id: string }) => item.id)
		expect(await ids('available')).toEqual(['own'])
		expect(await ids('select-options?tenantOnly=true')).toEqual([])
		shared.sharing.usages = ['configuration']
		expect(await ids('select-options?tenantOnly=true')).toEqual([sharedId])
	})
	it('rejects scope forgery and invalid usage before querying', async () => {
		for (const query of ['usage=admin', 'tenantId=foreign', 'organizationId=' + orgB]) {
			expect((await fetch(`${origin}/available?${query}`)).status).toBe(400)
		}
		expect(repository.find).not.toHaveBeenCalled()
	})
	it('denies users without current organization access and non-admin tenant discovery', async () => {
		commands.execute.mockResolvedValueOnce(null)
		expect((await fetch(`${origin}/available?usage=bind`)).status).toBe(403)
		organizationId = null
		expect((await fetch(`${origin}/available?usage=bind`)).status).toBe(403)
		expect(repository.find).not.toHaveBeenCalled()
	})
	it('denies organization and non-administrator policy edits', async () => {
		const request = () =>
			fetch(`${origin}/${sharedId}/sharing`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ visibility: 'private', organizationIds: [], usages: [] })
			})
		expect((await request()).status).toBe(403)
		organizationId = null
		expect((await request()).status).toBe(403)
		expect(repository.update).not.toHaveBeenCalled()
	})
	it('revokes discovery and already-bound runtime consumption without deleting the integration', async () => {
		organizationId = null
		admin = true
		expect(
			(
				await fetch(`${origin}/${sharedId}/sharing`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ visibility: 'private', organizationIds: [], usages: [] })
				})
			).status
		).toBe(200)
		organizationId = orgA
		admin = false
		expect(
			(await (await fetch(`${origin}/available?usage=bind`)).json()).map((item: { id: string }) => item.id)
		).toEqual(['own'])
		expect(await app.get(IntegrationService).readForUsage(sharedId, 'bind', RequestContext.getScope())).toBeNull()
	})
	it('rejects organizations outside the tenant', async () => {
		organizationId = null
		admin = true
		repository.manager.count.mockResolvedValueOnce(0)
		expect(
			(
				await fetch(`${origin}/${sharedId}/sharing`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						visibility: 'selected-organizations',
						organizationIds: [orgB],
						usages: ['invoke']
					})
				})
			).status
		).toBe(400)
		expect(repository.update).not.toHaveBeenCalled()
	})
	it('validates policy shape and supplies safe defaults at the HTTP boundary', async () => {
		organizationId = null
		admin = true
		const request = (body: object) =>
			fetch(`${origin}/${sharedId}/sharing`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			})
		for (const body of [
			{ visibility: 'selected-organizations' },
			{ visibility: 'all-organizations', usages: ['admin'] },
			{ visibility: 'private', tenantId: 'foreign' }
		])
			expect((await request(body)).status).toBe(400)
		expect(repository.update).not.toHaveBeenCalled()
		const response = await request({ visibility: 'private' })
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({
			id: sharedId,
			sharing: { visibility: 'private', organizationIds: [], usages: [] }
		})
	})
})
