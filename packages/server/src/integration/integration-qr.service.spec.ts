import type { RedisClientType } from 'redis'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IntegrationQrService } from './integration-qr.service'
import { IntegrationService } from './integration.service'
import { RedisLockService } from '../core/redis/redis-lock.service'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: { currentUserId: jest.fn(), currentTenantId: jest.fn(), getOrganizationId: jest.fn() }
}))
jest.mock('./integration.service', () => ({ IntegrationService: class IntegrationService {} }))
jest.mock('../core/redis/redis-lock.service', () => ({ RedisLockService: class RedisLockService {} }))
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

describe('IntegrationQrService', () => {
	const storage = new Map<string, string>()
	const redis = {
		get: jest.fn(async (key: string) => storage.get(key) ?? null),
		set: jest.fn(async (key: string, value: string) => {
			storage.set(key, value)
			return 'OK'
		}),
		del: jest.fn(async (key: string) => {
			storage.delete(key)
			return 1
		})
	}
	const locks = {
		runWithLock: jest.fn(async <T>(_key: string, _ttl: number, operation: () => Promise<T>) => ({
			acquired: true,
			value: await operation()
		}))
	}
	const strategy = {
		meta: { setup: { qrAuthorization: true } },
		beginQrAuthorization: jest.fn(),
		pollQrAuthorization: jest.fn(),
		getQrAuthorizationIdentity: jest.fn()
	}
	const integrations = {
		getIntegrationStrategy: jest.fn(() => strategy),
		readOneById: jest.fn(),
		findAll: jest.fn(),
		update: jest.fn(),
		runStrategyUpdateHook: jest.fn(),
		applyStrategyValidation: jest.fn(async (input) => input),
		create: jest.fn(async (input) => ({ ...input, slug: 'created' }))
	}
	const service = new IntegrationQrService(
		redis as unknown as RedisClientType,
		locks as unknown as RedisLockService,
		integrations as unknown as IntegrationService
	)

	beforeEach(() => {
		jest.clearAllMocks()
		storage.clear()
		jest.mocked(RequestContext.currentUserId).mockReturnValue('user')
		jest.mocked(RequestContext.currentTenantId).mockReturnValue('tenant')
		jest.mocked(RequestContext.getOrganizationId).mockReturnValue('organization')
		strategy.meta.setup.qrAuthorization = true
		strategy.beginQrAuthorization.mockResolvedValue({
			deviceCode: 'private-device',
			authorizationUrl: 'https://open-dev.dingtalk.com/authorize',
			expiresInSeconds: 7200,
			intervalSeconds: 2
		})
		strategy.pollQrAuthorization.mockResolvedValue({
			status: 'authorized',
			options: { clientId: 'app', clientSecret: 'secret' }
		})
		integrations.readOneById.mockResolvedValue(null)
		integrations.findAll.mockResolvedValue({ items: [] })
		strategy.getQrAuthorizationIdentity.mockReturnValue(null)
		integrations.applyStrategyValidation.mockImplementation(async (input) => input)
	})

	it('keeps provider device codes and credentials out of all public responses', async () => {
		const session = await service.begin('dingtalk_long', { name: 'Assistant' })
		expect(session).not.toHaveProperty('deviceCode')
		expect(session.expiresAt - Date.now()).toBeLessThanOrEqual(600000)
		expect(await service.poll(session.id)).toEqual({ status: 'authorized' })
		const created = await service.complete(session.id)
		expect(created).toEqual({
			id: session.id,
			name: 'Assistant',
			slug: 'created',
			provider: 'dingtalk_long',
			outcome: 'created'
		})
		expect(created).not.toHaveProperty('options')
		expect(storage.get(`integration:qr:session:${session.id}`)).not.toContain('secret')
	})

	it('binds quick authorization sessions to the assistant and trigger that started them', async () => {
		const session = await service.begin(
			'dingtalk_long',
			{ name: 'Assistant' },
			{ xpertId: 'one', triggerProvider: 'dingtalk' }
		)
		await expect(service.assertContext(session.id, 'one', 'dingtalk')).resolves.toBeUndefined()
		await expect(service.assertContext(session.id, 'two', 'dingtalk')).rejects.toThrow('not available')
		await expect(service.assertContext(session.id, 'one', 'other')).rejects.toThrow('not available')
	})

	it.each(['user', 'tenant', 'organization'])('rejects access from another %s', async (scope) => {
		const session = await service.begin('dingtalk_long', { name: 'Assistant' })
		if (scope === 'user') jest.mocked(RequestContext.currentUserId).mockReturnValue('other')
		if (scope === 'tenant') jest.mocked(RequestContext.currentTenantId).mockReturnValue('other')
		if (scope === 'organization') jest.mocked(RequestContext.getOrganizationId).mockReturnValue('other')
		await expect(service.poll(session.id)).rejects.toThrow('expired')
		await expect(service.complete(session.id)).rejects.toThrow('expired')
		await expect(service.cancel(session.id)).rejects.toThrow('expired')
		expect(strategy.pollQrAuthorization).not.toHaveBeenCalled()
		expect(integrations.create).not.toHaveBeenCalled()
	})

	it('invalidates the previous code on refresh and cancels without creating an integration', async () => {
		const first = await service.begin('dingtalk_long', { name: 'Assistant' })
		const second = await service.begin('dingtalk_long', { name: 'Assistant' })
		await expect(service.poll(first.id)).rejects.toThrow('expired')
		await service.cancel(second.id)
		await expect(service.poll(second.id)).rejects.toThrow('expired')
		expect(integrations.create).not.toHaveBeenCalled()
	})

	it('rate limits polling according to the provider interval', async () => {
		strategy.pollQrAuthorization.mockResolvedValue({ status: 'waiting' })
		const session = await service.begin('dingtalk_long', { name: 'Assistant' })
		await service.poll(session.id)
		await service.poll(session.id)
		expect(strategy.pollQrAuthorization).toHaveBeenCalledTimes(1)
		await expect(service.complete(session.id)).rejects.toThrow('not available')
	})

	it('persists cumulative provider backoff across API instances without exposing it or credentials', async () => {
		jest.useFakeTimers()
		try {
			strategy.pollQrAuthorization.mockResolvedValue({ status: 'waiting', intervalIncrementSeconds: 5 })
			const session = await service.begin('lark', { name: 'Assistant' })
			expect(await service.poll(session.id)).toEqual({ status: 'waiting' })
			const otherInstance = new IntegrationQrService(
				redis as unknown as RedisClientType,
				locks as unknown as RedisLockService,
				integrations as unknown as IntegrationService
			)
			jest.advanceTimersByTime(6999)
			await otherInstance.poll(session.id)
			expect(strategy.pollQrAuthorization).toHaveBeenCalledTimes(1)
			jest.advanceTimersByTime(1)
			await otherInstance.poll(session.id)
			expect(strategy.pollQrAuthorization).toHaveBeenCalledTimes(2)
			jest.advanceTimersByTime(11999)
			await service.poll(session.id)
			expect(strategy.pollQrAuthorization).toHaveBeenCalledTimes(2)
			jest.advanceTimersByTime(1)
			strategy.pollQrAuthorization.mockResolvedValue({ status: 'authorized', options: { appSecret: 'secret' } })
			expect(await service.poll(session.id)).toEqual({ status: 'authorized' })
		} finally {
			jest.useRealTimers()
		}
	})

	it.each([NaN, Infinity, -5, 0])('ignores invalid backoff increments (%s)', async (increment) => {
		strategy.pollQrAuthorization.mockResolvedValue({ status: 'waiting', intervalIncrementSeconds: increment })
		const session = await service.begin('lark', { name: 'Assistant' })
		await service.poll(session.id)
		expect(JSON.parse(storage.get(`integration:qr:session:${session.id}`)).intervalSeconds).toBe(2)
	})

	it('reuses a completed integration on retry and retains credentials after a failed save', async () => {
		const session = await service.begin('dingtalk_long', { name: 'Assistant' })
		await service.poll(session.id)
		integrations.applyStrategyValidation.mockRejectedValueOnce(new Error('connection failed'))
		await expect(service.complete(session.id)).rejects.toThrow('connection failed')
		expect(storage.get(`integration:qr:session:${session.id}`)).toContain('secret')
		const created = await service.complete(session.id)
		integrations.readOneById.mockResolvedValue({ ...created, tenantId: 'tenant', organizationId: 'organization' })
		await expect(service.complete(session.id)).resolves.toEqual(created)
		expect(integrations.create).toHaveBeenCalledTimes(1)
	})

	it('only starts providers explicitly advertising QR authorization', async () => {
		strategy.meta.setup.qrAuthorization = false
		await expect(service.begin('other', { name: 'Assistant' })).rejects.toThrow('not available')
		expect(strategy.beginQrAuthorization).not.toHaveBeenCalled()
	})

	it('reuses the same provider account in the current organization and keeps retries idempotent', async () => {
		const existing = {
			id: 'c5caf94e-de88-4db9-b223-6f0b94864d32',
			name: 'Existing robot',
			provider: 'dingtalk_long',
			tenantId: 'tenant',
			organizationId: 'organization',
			options: { clientId: 'app', clientSecret: 'old-secret', messageTemplate: 'preserved' }
		}
		const updated = { ...existing, options: { ...existing.options, clientSecret: 'secret' } }
		strategy.getQrAuthorizationIdentity.mockReturnValue('app')
		integrations.findAll.mockResolvedValue({ items: [existing] })
		integrations.readOneById.mockResolvedValueOnce(null).mockResolvedValue(updated)
		const session = await service.begin('dingtalk_long', { name: 'New name' })
		await service.poll(session.id)

		const result = await service.complete(session.id)
		expect(result).toMatchObject({ id: existing.id, name: existing.name, outcome: 'reused' })
		expect(result).not.toHaveProperty('options')
		expect(integrations.findAll).toHaveBeenCalledWith({
			where: { provider: 'dingtalk_long', tenantId: 'tenant', organizationId: 'organization' },
			order: { createdAt: 'ASC', id: 'ASC' }
		})
		expect(integrations.update).toHaveBeenCalledWith(existing.id, { options: updated.options })
		expect(integrations.runStrategyUpdateHook).toHaveBeenCalledWith(existing, updated)
		expect(integrations.create).not.toHaveBeenCalled()
		await expect(service.complete(session.id)).resolves.toEqual(result)
		expect(integrations.readOneById).toHaveBeenLastCalledWith(existing.id)
		expect(integrations.update).toHaveBeenCalledTimes(1)
		expect(storage.get(`integration:qr:session:${session.id}`)).not.toContain('secret')
	})

	it('creates an integration when the existing provider account is different', async () => {
		strategy.getQrAuthorizationIdentity.mockReturnValueOnce('new-app').mockReturnValue('other-app')
		integrations.findAll.mockResolvedValue({ items: [{ id: 'existing', options: { clientId: 'other-app' } }] })
		const session = await service.begin('dingtalk_long', { name: 'New robot' })
		await service.poll(session.id)
		await expect(service.complete(session.id)).resolves.toMatchObject({ id: session.id, name: 'New robot' })
		expect(integrations.create).toHaveBeenCalledTimes(1)
		expect(integrations.update).not.toHaveBeenCalled()
	})

	it('persists the supplied name, description and avatar for a new integration', async () => {
		const input = {
			name: '  Robot  ',
			description: 'Team assistant',
			avatar: { emoji: { id: 'robot_face' }, background: '#fff' }
		}
		const session = await service.begin('dingtalk_long', input)
		await service.poll(session.id)
		await service.complete(session.id)
		expect(integrations.create).toHaveBeenCalledWith(expect.objectContaining({ ...input, name: 'Robot' }))
	})

	it('keeps integration creation and separate assistant authorization sessions independent', async () => {
		const integration = await service.begin('dingtalk_long', { name: 'Integration' })
		const first = await service.begin(
			'dingtalk_long',
			{ name: 'First' },
			{ xpertId: 'one', triggerProvider: 'dingtalk' }
		)
		const second = await service.begin(
			'dingtalk_long',
			{ name: 'Second' },
			{ xpertId: 'two', triggerProvider: 'dingtalk' }
		)
		await service.begin(
			'dingtalk_long',
			{ name: 'First refreshed' },
			{ xpertId: 'one', triggerProvider: 'dingtalk' }
		)
		await expect(service.poll(first.id)).rejects.toThrow('expired')
		await expect(service.poll(integration.id)).resolves.toEqual({ status: 'authorized' })
		await expect(service.poll(second.id)).resolves.toEqual({ status: 'authorized' })
	})

	it('rejects invalid metadata before requesting a QR code', async () => {
		await expect(service.begin('dingtalk_long', { name: ' ', avatar: {} })).rejects.toThrow('not available')
		await expect(service.begin('dingtalk_long', { name: 'Robot', avatar: { emoji: { id: 42 } } })).rejects.toThrow(
			'not available'
		)
		expect(strategy.beginQrAuthorization).not.toHaveBeenCalled()
	})
})
