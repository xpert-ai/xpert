import { AnalyticsResultCache, analyticsCacheKey } from './analytics-result-cache'
import type { AnalyticalDataset } from '@xpert-ai/contracts'
const result: AnalyticalDataset = {
	schema: 'xpert.analytics.dataset',
	datasetId: 'data',
	fields: [],
	rows: [{}],
	grain: [],
	completeness: { returnedRows: 1, totalAccuracy: 'exact', scope: 'full_query_result', truncated: false },
	freshness: { executedAt: '2026-11-12T00:00:00Z', sourceFetchedAt: '2026-11-12T00:00:00Z' },
	provenance: { executionId: 'execution', bindingId: 'binding', providerId: 'file.table' }
}
const limits = { entries: 2, bytes: 100000, entryBytes: 10000, pending: 2 }
function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((yes) => {
		resolve = yes
	})
	return { promise, resolve }
}
describe('bounded Analytics result cache', () => {
	it('expires from execution start, isolates returned mutations and preserves source time', async () => {
		let now = 0
		const cache = new AnalyticsResultCache(limits, () => now),
			load = jest.fn(async () => result)
		const first = await cache.read('a', 100, false, load)
		first.rows.length = 0
		now = 99
		expect(await cache.read('a', 100, false, load)).toEqual(result)
		now = 100
		await cache.read('a', 100, false, load)
		expect(load).toHaveBeenCalledTimes(2)
	})
	it('coalesces equal requests but honors a waiter with a shorter age budget', async () => {
		let now = 0
		const cache = new AnalyticsResultCache(limits, () => now),
			pending = deferred<AnalyticalDataset>()
		const load = jest.fn(async () => result)
		const first = cache.read('a', 100, false, () => pending.promise)
		const second = cache.read('a', 10, false, load)
		now = 20
		pending.resolve(result)
		await Promise.all([first, second])
		expect(load).toHaveBeenCalledTimes(1)
	})
	it('does not retain failures or results beyond the execution age budget', async () => {
		let now = 0
		const cache = new AnalyticsResultCache(limits, () => now)
		const load = jest.fn(async () => result)
		await expect(
			cache.read('a', 100, false, async () => {
				throw Error('failed')
			})
		).rejects.toThrow('failed')
		await cache.read('a', 100, false, async () => {
			now = 101
			return result
		})
		await cache.read('a', 100, false, load)
		expect(load).toHaveBeenCalledTimes(1)
	})
	it('force refresh does not join or let an older in-flight load repopulate the cache', async () => {
		const cache = new AnalyticsResultCache(limits),
			old = deferred<AnalyticalDataset>()
		const first = cache.read('a', 10000, false, () => old.promise)
		const load = jest.fn(async () => result)
		await cache.read('a', 10000, true, load)
		old.resolve(result)
		await first
		await cache.read('a', 10000, false, load)
		expect(load).toHaveBeenCalledTimes(2)
	})
	it('does not let an older load failure remove a newer cached result', async () => {
		const cache = new AnalyticsResultCache(limits)
		let rejectOld!: (reason: Error) => void
		const old = new Promise<AnalyticalDataset>((_resolve, reject) => {
			rejectOld = reject
		})
		const oldFailure = expect(cache.read('a', 10000, false, () => old)).rejects.toThrow('Old execution failed')
		const fresh = { ...result, provenance: { ...result.provenance, executionId: 'fresh' } }
		const load = jest.fn(async () => fresh)
		await cache.read('a', 10000, true, load)
		await cache.read('a', 10000, false, load)
		rejectOld(new Error('Old execution failed'))
		await oldFailure
		expect(await cache.read('a', 10000, false, load)).toEqual(fresh)
		expect(load).toHaveBeenCalledTimes(2)
	})
	it('invalidates only the execution rejected by a late authorization check', async () => {
		const cache = new AnalyticsResultCache(limits)
		const fresh = { ...result, provenance: { ...result.provenance, executionId: 'fresh' } }
		const load = jest.fn(async () => fresh)
		await cache.read('a', 10000, false, load)
		cache.delete('a', 'older-execution')
		expect(await cache.read('a', 10000, false, load)).toEqual(fresh)
		expect(load).toHaveBeenCalledTimes(1)
		cache.delete('a', 'fresh')
		await cache.read('a', 10000, false, load)
		expect(load).toHaveBeenCalledTimes(2)
	})
	it('evicts least recently used entries and refuses oversized values', async () => {
		const cache = new AnalyticsResultCache(limits),
			load = jest.fn(async () => result)
		await cache.read('a', 10000, false, load)
		await cache.read('b', 10000, false, load)
		await cache.read('a', 10000, false, load)
		await cache.read('c', 10000, false, load)
		await cache.read('b', 10000, false, load)
		expect(load).toHaveBeenCalledTimes(4)
		const bounded = new AnalyticsResultCache({ ...limits, entryBytes: 1 })
		await bounded.read('a', 10000, false, load)
		await bounded.read('a', 10000, false, load)
		expect(load).toHaveBeenCalledTimes(6)
	})
	it('enforces total bytes and pending map bounds independently of entry count', async () => {
		const size = Buffer.byteLength(JSON.stringify(result))
		const cache = new AnalyticsResultCache({ ...limits, bytes: size })
		const load = jest.fn(async () => result)
		await cache.read('a', 10000, false, load)
		await cache.read('b', 10000, false, load)
		await cache.read('a', 10000, false, load)
		expect(load).toHaveBeenCalledTimes(3)
		const pending = deferred<AnalyticalDataset>(),
			bounded = new AnalyticsResultCache({ ...limits, pending: 1 })
		const first = bounded.read('a', 10000, false, () => pending.promise)
		await bounded.read('b', 10000, false, load)
		await bounded.read('b', 10000, false, load)
		pending.resolve(result)
		await first
		expect(load).toHaveBeenCalledTimes(5)
	})
	it('canonicalizes object keys while separating every identity and definition boundary', () => {
		const input = {
			actor: { tenant: 't', org: 'o', user: 'u' },
			options: { secret: 'never-indexed' },
			binding: ['a', 'b'],
			params: { a: 1, b: 2 }
		}
		const key = analyticsCacheKey(input)
		expect(key).toMatch(/^[0-9a-f]{64}$/)
		expect(analyticsCacheKey({ ...input, params: { b: 2, a: 1 } })).toBe(key)
		for (const changed of [
			{ ...input, actor: { ...input.actor, user: 'v' } },
			{ ...input, binding: ['b', 'a'] },
			{ ...input, params: { a: 2, b: 2 } },
			{ ...input, options: { secret: 'rotated' } }
		])
			expect(analyticsCacheKey(changed)).not.toBe(key)
	})
})
