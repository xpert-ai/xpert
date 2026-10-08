import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { SetupPluginsController } from './setup-plugins.controller'
import { SetupPluginsService } from './setup-plugins.service'
import { RoleGuard, TenantPermissionGuard } from '../../shared/guards'

jest.mock('./setup-plugins.service')

describe('SetupPluginsController HTTP validation', () => {
	let app: INestApplication
	let baseUrl: string
	const post = (body: object) =>
		fetch(`${baseUrl}/system/setup/plugins`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
	const catalog = jest.fn(async (query) => query)
	const start = jest.fn(async () => ({ progress: { phase: 'installing' } }))
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [SetupPluginsController],
			providers: [{ provide: SetupPluginsService, useValue: { start, catalog } }]
		})
			.overrideGuard(RoleGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(TenantPermissionGuard)
			.useValue({ canActivate: () => true })
			.compile()
		app = module.createNestApplication({ logger: false })
		await app.listen(0, '127.0.0.1')
		baseUrl = await app.getUrl()
	})
	afterAll(async () => {
		await app.close()
	})
	it('accepts a selection', async () => {
		expect((await post({ plugins: [] })).status).toBe(202)
		expect(start).toHaveBeenCalledWith([], true)
	})
	it('allows explicitly skipping default imports', async () => {
		expect((await post({ plugins: [], importDefaultAgentPlugins: false })).status).toBe(202)
		expect(start).toHaveBeenCalledWith([], false)
	})
	it('accepts selections beyond the old fourteen-app limit', async () => {
		expect((await post({ plugins: Array.from({ length: 25 }, (_, i) => `plugin-${i}`) })).status).toBe(202)
	})
	it('coerces pagination and supplies defaults at the query boundary', async () => {
		const result = await fetch(`${baseUrl}/system/setup/plugins/catalog?page=2&pageSize=12&type=model`)
		expect(result.status).toBe(200)
		expect(await result.json()).toEqual({ page: 2, pageSize: 12, type: 'model', groupBy: 'none' })
	})
	it.each(['page=0', 'pageSize=1000', 'page=oops', 'groupBy=name', 'businessCategory=invalid', 'extra=1'])(
		'rejects invalid catalog query %s',
		async (query) => {
			expect((await fetch(`${baseUrl}/system/setup/plugins/catalog?${query}`)).status).toBe(400)
		}
	)
	it.each([
		{ plugins: 'all' },
		{ plugins: [], importDefaultAgentPlugins: 'yes' },
		{ plugins: [], deferActivation: true },
		{ plugins: Array(5001).fill('x') }
	])('rejects malformed input and extra controls', async (body) => {
		expect((await post(body)).status).toBe(400)
	})
})
