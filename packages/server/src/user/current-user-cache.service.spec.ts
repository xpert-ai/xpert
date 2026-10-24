import 'reflect-metadata'
import { createCache } from 'cache-manager'
import Keyv from 'keyv'
import { CurrentUserCacheService } from './current-user-cache.service'
import { User } from './user.entity'

describe('CurrentUserCacheService', () => {
	const cache = createCache({ stores: [new Keyv()] })
	let service: CurrentUserCacheService
	const user = () =>
		Object.assign(new User(), {
			id: 'user-1',
			tenantId: 'tenant-1',
			email: 'fixture@example.invalid',
			hash: 'test-password-hash',
			refreshToken: 'test-refresh-token',
			role: { id: 'role-1', rolePermissions: [{ enabled: true }] }
		})
	beforeEach(async () => {
		jest.restoreAllMocks()
		await cache.clear()
		service = new CurrentUserCacheService(cache)
	})
	afterAll(async () => {
		await cache.disconnect()
	})
	const query = { relations: ['role', 'role.rolePermissions'] }

	it('excludes credentials, preserves User serialization, and isolates mutable objects', async () => {
		const write = jest.spyOn(cache, 'set')
		const load = jest.fn(async () => user())
		const first = await service.read('core', 'tenant-1', 'user-1', query, load)
		expect(first).toBeInstanceOf(User)
		expect(first.hash).toBeUndefined()
		expect(first.refreshToken).toBeUndefined()
		expect(JSON.stringify(write.mock.calls)).not.toContain('test-password-hash')
		expect(JSON.stringify(write.mock.calls)).not.toContain('test-refresh-token')
		first.role.rolePermissions[0].enabled = false
		const second = await service.read('core', 'tenant-1', 'user-1', query, load)
		expect(second.role.rolePermissions[0].enabled).toBe(true)
		expect(load).toHaveBeenCalledTimes(1)
	})

	it('deduplicates concurrent loads without sharing mutable results', async () => {
		const load = jest.fn(async () => user())
		const [a, b] = await Promise.all([
			service.read('core', 'tenant-1', 'user-1', query, load),
			service.read('core', 'tenant-1', 'user-1', query, load)
		])
		expect(load).toHaveBeenCalledTimes(1)
		expect(a).not.toBe(b)
	})

	it('does not publish an old in-flight load under the post-invalidation version', async () => {
		let finish: (user: User) => void = () => undefined
		let started: () => void = () => undefined
		const ready = new Promise<void>((resolve) => {
			started = resolve
		})
		const pending = service.read('core', 'tenant-1', 'user-1', query, () => {
			started()
			return new Promise<User>((resolve) => {
				finish = resolve
			})
		})
		await ready
		await service.invalidate('RolePermission', 'tenant-1')
		finish(user())
		await pending
		const load = jest.fn(async () => Object.assign(user(), { email: 'new@example.invalid' }))
		expect((await service.read('core', 'tenant-1', 'user-1', query, load)).email).toBe('new@example.invalid')
		expect(load).toHaveBeenCalledTimes(1)
	})

	it('isolates tenant, user, query projection and layer; expires results after 60 seconds', async () => {
		const load = jest.fn(async () => user())
		await service.read('core', 'tenant-1', 'user-1', query, load)
		await service.read('core', 'tenant-2', 'user-1', query, load)
		await service.read('core', 'tenant-1', 'user-2', query, load)
		await service.read('core', 'tenant-1', 'user-1', { select: { id: true } }, load)
		await service.read('organizations', 'tenant-1', 'user-1', query, load)
		expect(load).toHaveBeenCalledTimes(5)
		const now = Date.now()
		jest.spyOn(Date, 'now').mockReturnValue(now + 60_001)
		await service.read('core', 'tenant-1', 'user-1', query, load)
		expect(load).toHaveBeenCalledTimes(6)
	})

	it('uses the loader when Redis reads or writes fail and never caches loader failures', async () => {
		jest.spyOn(cache, 'mget').mockRejectedValue(new Error('cache unavailable'))
		const load = jest.fn(async () => user())
		expect((await service.read('core', 'tenant-1', 'user-1', query, load)).id).toBe('user-1')
		jest.restoreAllMocks()
		jest.spyOn(cache, 'set').mockRejectedValue(new Error('cache unavailable'))
		expect((await service.read('core', 'tenant-1', 'user-1', query, load)).id).toBe('user-1')
		await expect(
			service.read('core', 'tenant-1', 'user-1', query, async () => {
				throw new Error('not found')
			})
		).rejects.toThrow('not found')
	})
})
