import type { Cache } from 'cache-manager'
import { CATALOG_TTL_MS, RuntimeResourceCatalogCache } from './runtime-catalog.cache'

describe('scoped resource display cache', () => {
    const store = new Map<string, string>()
    const shared = {
        get: async (key: string) => store.get(key),
        set: async (key: string, value: string) => {
            store.set(key, value)
        }
    } as unknown as Cache
    const inventory = { bindings: [], discovered: [], candidates: [], assistantPackages: [] }
    beforeEach(() => {
        store.clear()
        jest.useFakeTimers()
    })
    afterEach(() => jest.useRealTimers())
    it('shares in-flight inventories, expires them and isolates every scope dimension', async () => {
        const cache = new RuntimeResourceCatalogCache(shared)
        const scope = {
            tenant: 't',
            organization: 'o',
            user: 'u',
            assistant: 'a',
            project: 'p',
            role: 'r',
            language: 'en'
        }
        const load = jest.fn(async () => inventory)
        const key = await cache.key(scope)
        await Promise.all([cache.inventory(key, load), cache.inventory(key, load)])
        expect(load).toHaveBeenCalledTimes(1)
        for (const field of Object.keys(scope)) expect(await cache.key({ ...scope, [field]: 'other' })).not.toBe(key)
        jest.advanceTimersByTime(CATALOG_TTL_MS + 1)
        await cache.inventory(key, load)
        expect(load).toHaveBeenCalledTimes(2)
    })
    it('invalidates all workers through the shared revision and never reuses failures', async () => {
        const first = new RuntimeResourceCatalogCache(shared),
            second = new RuntimeResourceCatalogCache(shared)
        const before = await second.key({ user: 'one' })
        await first.invalidate()
        expect(await second.key({ user: 'one' })).not.toBe(before)
        const load = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(inventory)
        await expect(second.inventory(before, load)).rejects.toThrow('offline')
        await second.inventory(before, load)
        expect(load).toHaveBeenCalledTimes(2)
    })
    it('isolates search/purpose/pages and returns independent response objects', async () => {
        const cache = new RuntimeResourceCatalogCache(shared)
        const key = await cache.key({ user: 'one' })
        const load = jest.fn(async () => ({ items: [], total: 200 }))
        const first = await cache.page(key, { offset: 0 }, load)
        first.total = 0
        expect((await cache.page(key, { offset: 0 }, load)).total).toBe(200)
        await cache.page(key, { offset: 100 }, load)
        await cache.page(key, { offset: 0, purpose: 'selection' }, load)
        await cache.page(key, { offset: 0, search: 'filter' }, load)
        expect(load).toHaveBeenCalledTimes(4)
    })
})
