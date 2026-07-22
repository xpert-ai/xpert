import { RUNTIME_RESTART_CONFIRMATION, RolesEnum } from '@xpert-ai/contracts'
import { setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '../core/context'
import { RuntimeControlService, RuntimeProcessSignaler } from './runtime-control.service'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'

describe('RuntimeControlService', () => {
	const redis = {
		set: jest.fn(),
		eval: jest.fn()
	}
	const signaler: RuntimeProcessSignaler = { signal: jest.fn() }
	let lifecycle: RuntimeLifecycleService

	beforeEach(() => {
		jest.useFakeTimers()
		jest.resetAllMocks()
		process.env.NODE_ENV = 'test'
		setDefaultTenantId('tenant-default')
		jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue(null)
		jest.spyOn(RequestContext, 'hasRole').mockReturnValue(true)
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-default')
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
		lifecycle = new RuntimeLifecycleService()
	})

	afterEach(() => {
		jest.restoreAllMocks()
		jest.useRealTimers()
		setDefaultTenantId(null)
	})

	it('accepts a confirmed default-tenant SuperAdmin request and signals after the response delay', async () => {
		redis.set.mockResolvedValue('OK')
		const service = new RuntimeControlService(redis, signaler, lifecycle)

		const result = await service.requestRestart(
			{ confirmation: RUNTIME_RESTART_CONFIRMATION, reason: 'activate staged system plugin' },
			{ sourceIp: '127.0.0.1' }
		)

		expect(result).toMatchObject({
			accepted: true,
			mode: 'self-signal',
			signalAfterMs: 750,
			drainTimeoutMs: 30_000
		})
		expect(redis.set).toHaveBeenCalledWith(
			'xpert:system:runtime:restart',
			expect.stringContaining(result.restartId),
			expect.objectContaining({ NX: true, PX: expect.any(Number) })
		)
		expect(lifecycle.readiness()).toMatchObject({ status: 'draining', restartId: result.restartId })

		await jest.advanceTimersByTimeAsync(750)
		expect(signaler.signal).toHaveBeenCalledWith('SIGTERM')
	})

	it('reports restart capability for an interactive default-tenant SuperAdmin', () => {
		const service = new RuntimeControlService(redis, signaler, lifecycle)

		expect(service.restartCapability()).toEqual({
			allowed: true,
			mode: 'self-signal',
			reason: 'allowed'
		})
	})

	it('reports the scope reason instead of exposing restart outside the default tenant', () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-other')
		const service = new RuntimeControlService(redis, signaler, lifecycle)

		expect(service.restartCapability()).toEqual({
			allowed: false,
			mode: 'self-signal',
			reason: 'default-tenant-required'
		})
	})

	it('rejects actors outside the default tenant even when they are SuperAdmin', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-other')
		const service = new RuntimeControlService(redis, signaler, lifecycle)

		await expect(service.requestRestart({ confirmation: RUNTIME_RESTART_CONFIRMATION })).rejects.toBeInstanceOf(
			ForbiddenException
		)
		expect(redis.set).not.toHaveBeenCalled()
	})

	it('rejects concurrent restart requests when the distributed lock is held', async () => {
		redis.set.mockResolvedValue(null)
		const service = new RuntimeControlService(redis, signaler, lifecycle)

		await expect(service.requestRestart({ confirmation: RUNTIME_RESTART_CONFIRMATION })).rejects.toBeInstanceOf(
			ConflictException
		)
		expect(signaler.signal).not.toHaveBeenCalled()
	})

	it('returns to ready and atomically releases the lock when SIGTERM signaling fails', async () => {
		redis.set.mockResolvedValue('OK')
		redis.eval.mockResolvedValue(1)
		jest.mocked(signaler.signal).mockImplementation(() => {
			throw new Error('signal unavailable')
		})
		const service = new RuntimeControlService(redis, signaler, lifecycle)

		await service.requestRestart({ confirmation: RUNTIME_RESTART_CONFIRMATION })
		await jest.advanceTimersByTimeAsync(750)

		expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('get'"), {
			keys: ['xpert:system:runtime:restart'],
			arguments: [expect.stringContaining(lifecycle.instanceId)]
		})
		expect(lifecycle.readiness().status).toBe('ready')
	})
})
