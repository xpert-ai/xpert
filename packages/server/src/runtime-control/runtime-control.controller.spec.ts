import { INestApplication } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { RoleGuard, TenantPermissionGuard } from '../shared/guards'
import { RuntimeControlController } from './runtime-control.controller'
import { RuntimeControlService } from './runtime-control.service'

describe('Runtime control HTTP boundary', () => {
	const service = {
		retireInstance: jest.fn(),
		listInstances: jest.fn(),
		requestRestart: jest.fn(),
		pluginRuntimeSnapshot: jest.fn()
	}
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
		service.requestRestart.mockResolvedValue({ accepted: true })
	})
	afterAll(async () => app?.close())

	const retire = (body: unknown) =>
		fetch(`${origin}/system/runtime/instances/api-old/retire`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})

	it('preserves tenant and role guards on membership and restart endpoints', () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, RuntimeControlController)).toContain(TenantPermissionGuard)
		for (const method of ['listInstances', 'retireInstance', 'restart', 'pluginRuntimeSnapshot'] as const) {
			expect(Reflect.getMetadata(GUARDS_METADATA, RuntimeControlController.prototype[method])).toContain(
				RoleGuard
			)
		}
	})

	const restart = (body: unknown) =>
		fetch(`${origin}/system/runtime/restart`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})

	it.each([{}, { allowDowntime: false }, { allowDowntime: true }])(
		'validates explicit outage consent without defaulting it on: %j',
		async (options) => {
			const body = { confirmation: 'RESTART', ...options }
			expect((await restart(body)).status).toBe(202)
			expect(service.requestRestart).toHaveBeenCalledWith(body, { sourceIp: expect.any(String) })
		}
	)

	it.each([
		{ confirmation: 'RESTART', allowDowntime: 'true' },
		{ confirmation: 'RESTART', allowDowntime: 1 },
		{ confirmation: 'RESTART', force: true },
		{ confirmation: 'wrong', allowDowntime: true },
		{ allowDowntime: true },
		{ confirmation: 'RESTART', runtimeRequirements: [{ state: 'loaded' }] },
		...[-1, 1.5, '62', null, Number.MAX_SAFE_INTEGER + 1].map((expectedGeneration) => ({
			confirmation: 'RESTART',
			expectedGeneration
		}))
	])('rejects invalid restart input before requesting an outage: %j', async (body) => {
		const response = await restart(body)
		expect(response.status).toBe(400)
		expect(await response.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' })
		expect(service.requestRestart).not.toHaveBeenCalled()
	})

	it('passes the validated generation fence and exposes the current manifest route', async () => {
		const body = {
			confirmation: 'RESTART',
			expectedGeneration: 62,
			runtimeRequirements: [{ scopeKey: 'org-1', pluginName: 'plugin', version: '0.6.1', state: 'loaded' }]
		}
		expect((await restart(body)).status).toBe(202)
		expect(service.requestRestart).toHaveBeenCalledWith(body, expect.any(Object))
		service.pluginRuntimeSnapshot.mockResolvedValue({
			generation: 62,
			status: 'completed',
			requirements: body.runtimeRequirements
		})
		const response = await fetch(`${origin}/system/runtime/plugin-state`)
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({ generation: 62, status: 'completed' })
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
