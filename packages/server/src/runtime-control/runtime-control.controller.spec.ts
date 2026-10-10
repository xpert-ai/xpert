import { INestApplication } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { RoleGuard, TenantPermissionGuard } from '../shared/guards'
import { RuntimeControlController } from './runtime-control.controller'
import { RuntimeControlService } from './runtime-control.service'

describe('Runtime membership HTTP boundary', () => {
	const service = { retireInstance: jest.fn(), listInstances: jest.fn() }
	let app: INestApplication
	let origin: string

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [RuntimeControlController],
			providers: [{ provide: RuntimeControlService, useValue: service }]
		})
			.overrideGuard(TenantPermissionGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RoleGuard)
			.useValue({ canActivate: () => true })
			.compile()
		app = module.createNestApplication({ logger: false })
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	beforeEach(() => {
		jest.clearAllMocks()
		service.retireInstance.mockResolvedValue({ status: 'retired' })
	})
	afterAll(async () => app?.close())

	const retire = (body: unknown) =>
		fetch(`${origin}/system/runtime/instances/api-old/retire`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})

	it('preserves tenant and role guards on both membership endpoints', () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, RuntimeControlController)).toContain(TenantPermissionGuard)
		for (const method of ['listInstances', 'retireInstance'] as const) {
			expect(Reflect.getMetadata(GUARDS_METADATA, RuntimeControlController.prototype[method])).toContain(
				RoleGuard
			)
		}
	})

	it('passes a validated boot identity and audit address to retirement', async () => {
		const response = await retire({ expectedBootId: 'boot-1' })
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ status: 'retired' })
		expect(service.retireInstance).toHaveBeenCalledWith(
			'api-old',
			{ expectedBootId: 'boot-1' },
			{ sourceIp: expect.any(String) }
		)
	})

	it.each([
		{},
		{ expectedBootId: '' },
		{ expectedBootId: 42 },
		{ expectedBootId: 'x'.repeat(101) },
		{ expectedBootId: 'boot-1', force: true }
	])('rejects invalid retirement input at the HTTP boundary: %j', async (body) => {
		expect((await retire(body)).status).toBe(400)
		expect(service.retireInstance).not.toHaveBeenCalled()
	})
})
