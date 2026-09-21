import type { MarketplaceLoader, MarketplaceValueCache } from './plugin-marketplace-shared-cache'

/** Shared single-flight and bounded failure backoff for foreground and background work. */
export class MarketplaceJobs<T> {
	private readonly jobs = new Map<string, Promise<T>>()
	private readonly failures = new Map<string, { error: unknown; retryAt: number }>()

	constructor(
		private readonly failureTtl = 60_000,
		private readonly limit = 512
	) {}

	canStart(key: string) {
		return !this.jobs.has(key) && (this.failures.get(key)?.retryAt ?? 0) <= Date.now()
	}

	run(key: string, loader: () => Promise<T>, force = false): Promise<T> {
		const pending = this.jobs.get(key)
		if (pending) return pending
		const failure = this.failures.get(key)
		if (!force && failure && failure.retryAt > Date.now()) return Promise.reject(failure.error)
		const job = Promise.resolve()
			.then(loader)
			.then((value) => {
				this.failures.delete(key)
				return value
			})
			.catch((error: unknown) => {
				this.failures.delete(key)
				this.failures.set(key, { error, retryAt: Date.now() + this.failureTtl })
				while (this.failures.size > this.limit) this.failures.delete(this.failures.keys().next().value)
				throw error
			})
			.finally(() => this.jobs.delete(key))
		this.jobs.set(key, job)
		return job
	}

	schedule(key: string, loader: () => Promise<T>, onError: (error: unknown) => void) {
		if (this.canStart(key)) void this.run(key, loader).catch(onError)
	}
}

/** Keep stale values readable while the same scheduler coalesces optional refreshes. */
export class MarketplaceCache<T> implements MarketplaceValueCache<T> {
	private readonly entries = new Map<string, { value: T; expiresAt: number }>()
	private readonly jobs: MarketplaceJobs<T>

	constructor(
		private readonly ttl = 600_000,
		private readonly failureTtl = 60_000,
		private readonly limit = 512
	) {
		this.jobs = new MarketplaceJobs(failureTtl, limit)
	}

	read(key: string, fallback: T, loader: MarketplaceLoader<T>, onError: (error: unknown) => void): T {
		const entry = this.entries.get(key)
		if ((!entry || entry.expiresAt <= Date.now()) && this.jobs.canStart(key)) {
			void this.load(key, loader).catch(onError)
		}
		return entry?.value ?? fallback
	}

	load(key: string, loader: MarketplaceLoader<T>, force = false): Promise<T> {
		const entry = this.entries.get(key)
		if (!force && entry && entry.expiresAt > Date.now()) return Promise.resolve(entry.value)
		return this.jobs.run(
			key,
			async () => {
				const value = await loader({ assertOwned: async () => undefined })
				this.entries.delete(key)
				this.entries.set(key, { value, expiresAt: Date.now() + (value === null ? this.failureTtl : this.ttl) })
				while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value)
				return value
			},
			force
		)
	}
}
