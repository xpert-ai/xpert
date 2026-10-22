import { Logger } from '@nestjs/common'
import type { Cache } from 'cache-manager'
import type { Request, Response } from 'express'
import { sign } from 'jsonwebtoken'
import { TenantSettingService } from './tenant-setting.service'
import { TenantSettingsMiddleware } from './tenant-settings.middleware'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

jest.mock('./tenant-setting.service', () => ({ TenantSettingService: class TenantSettingService {} }))

describe('tenant settings middleware during Redis failures', () => {
	const settings = { fileStorageProvider: 'LOCAL' }
	let cache: { get: jest.Mock; set: jest.Mock }
	let service: { getSettings: jest.Mock }
	let middleware: TenantSettingsMiddleware
	const response = {} as Response
	const request = (path = '/api/system/runtime/restart-capability', tenantId: unknown = 'tenant-a') =>
		({
			method: 'GET',
			url: path,
			originalUrl: path,
			headers: { authorization: `Bearer ${sign({ tenantId }, 'test-secret')}` }
		}) as Request

	beforeEach(() => {
		jest.useFakeTimers()
		cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) }
		service = { getSettings: jest.fn().mockResolvedValue(settings) }
		middleware = new TenantSettingsMiddleware(cache as unknown as Cache, service as unknown as TenantSettingService)
	})
	afterEach(() => {
		jest.useRealTimers()
		jest.restoreAllMocks()
	})

	it.each(['GET', 'HEAD'])('keeps authenticated %s readiness independent of cache and database', async (method) => {
		const req = request('/api/health/ready?details=1')
		req.method = method
		const next = jest.fn()
		await middleware.use(req, response, next)
		expect(cache.get).not.toHaveBeenCalled()
		expect(service.getSettings).not.toHaveBeenCalled()
		expect(next).toHaveBeenCalledTimes(1)
	})

	it('uses cached tenant settings without a database read', async () => {
		cache.get.mockResolvedValue(settings)
		const req = request()
		const next = jest.fn()
		await middleware.use(req, response, next)
		expect(req['tenantSettings']).toEqual(settings)
		expect(service.getSettings).not.toHaveBeenCalled()
		expect(next).toHaveBeenCalledTimes(1)
	})

	it('falls back to the same tenant in the database after a hung cache read', async () => {
		let reject!: (error: Error) => void
		cache.get.mockReturnValue(
			new Promise((_, no) => {
				reject = no
			})
		)
		const req = request()
		const next = jest.fn()
		const call = middleware.use(req, response, next)
		await jest.advanceTimersByTimeAsync(250)
		await call
		expect(service.getSettings).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a' } })
		expect(req['tenantSettings']).toEqual(settings)
		expect(next).toHaveBeenCalledTimes(1)
		expect(cache.set).not.toHaveBeenCalled()
		const second = request('/api/plugin', 'tenant-b')
		await middleware.use(second, response, next)
		expect(service.getSettings).toHaveBeenLastCalledWith({ where: { tenantId: 'tenant-b' } })
		expect(cache.get).toHaveBeenCalledTimes(1)
		reject(new Error('late failure'))
		await jest.advanceTimersByTimeAsync(0)
	})

	it('keeps database settings when cache population stalls or fails', async () => {
		let finish!: () => void
		cache.set.mockReturnValue(
			new Promise<void>((resolve) => {
				finish = resolve
			})
		)
		const req = request('/api/plugin')
		const next = jest.fn()
		const call = middleware.use(req, response, next)
		await jest.advanceTimersByTimeAsync(250)
		await call
		expect(req['tenantSettings']).toEqual(settings)
		expect(next).toHaveBeenCalledTimes(1)
		finish()
		await jest.advanceTimersByTimeAsync(0)
		cache.set.mockRejectedValue(new Error('offline'))
		await middleware.use(request(), response, next)
		expect(next).toHaveBeenCalledTimes(2)
	})

	it('falls back on cache errors but leaves authorization to downstream guards', async () => {
		cache.get.mockRejectedValue(new Error('offline'))
		const req = request()
		const next = jest.fn()
		await middleware.use(req, response, next)
		expect(req['tenantSettings']).toEqual(settings)
		expect(req.user).toBeUndefined()
		expect(req.headers.authorization).toBe(request().headers.authorization)
		expect(next).toHaveBeenCalledTimes(1)
	})

	it.each([null, 12, {}, ''])('does not query settings for an invalid tenant claim: %p', async (tenantId) => {
		await middleware.use(request('/api/plugin', tenantId), response, jest.fn())
		expect(cache.get).not.toHaveBeenCalled()
		expect(service.getSettings).not.toHaveBeenCalled()
	})

	it('continues to guards on database failure without exposing error payloads', async () => {
		service.getSettings.mockRejectedValue(new Error('private database details'))
		const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
		const next = jest.fn()
		await middleware.use(request(), response, next)
		expect(next).toHaveBeenCalledTimes(1)
		expect(warn).toHaveBeenCalledWith('Tenant settings lookup failed')
	})
})
