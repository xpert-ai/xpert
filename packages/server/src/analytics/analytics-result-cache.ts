import { createHash } from 'node:crypto'
import type { AnalyticalDataset } from '@xpert-ai/contracts'

/** Process-local bounded storage; callers must authorize each lookup and validate before insertion.
 * Values are copied both ways. Neither credentials nor raw keys are retained in the index. */
export class AnalyticsResultCache {
	private readonly entries = new Map<string, { value: AnalyticalDataset; storedAt: number; bytes: number }>()
	private readonly pending = new Map<string, { work: Promise<AnalyticalDataset>; startedAt: number }>()
	private bytes = 0
	constructor(
		private readonly limits = { entries: 128, bytes: 8_000_000, entryBytes: 1_000_000, pending: 32 },
		private readonly now = () => Date.now()
	) {}

	/** A delayed authorization failure may invalidate only the execution it actually observed. */
	delete(key: string, executionId?: string) {
		const entry = this.entries.get(key)
		if (entry && (executionId === undefined || entry.value.provenance.executionId === executionId)) {
			this.bytes -= entry.bytes
			this.entries.delete(key)
		}
	}

	/** maxAgeMs is validated by the request schema. Admission limits bound retained state, not query concurrency. */
	async read(key: string, maxAgeMs: number, forceRefresh: boolean, load: () => Promise<AnalyticalDataset>) {
		for (const [id, entry] of this.entries) if (this.now() - entry.storedAt >= 60000) this.delete(id)
		const cached = this.entries.get(key)
		if (!forceRefresh && cached && this.now() - cached.storedAt < maxAgeMs) {
			this.entries.delete(key)
			this.entries.set(key, cached)
			return structuredClone(cached.value)
		}
		// Force refresh bypasses reuse and insertion. Detach older work so it cannot repopulate this key.
		if (forceRefresh) {
			this.delete(key)
			this.pending.delete(key)
		}
		const active = !forceRefresh ? this.pending.get(key) : undefined
		if (active) {
			// A joining caller may have a tighter freshness budget than the original execution.
			const result = await active.work
			return structuredClone(this.now() - active.startedAt < maxAgeMs ? result : await load())
		}
		// Capacity exhaustion falls back to a fresh query; it must not turn into an availability error.
		if (this.pending.size >= this.limits.pending || forceRefresh) return structuredClone(await load())
		const startedAt = this.now()
		const work = load().then((value) => {
			const bytes = Buffer.byteLength(JSON.stringify(value))
			// Expiry starts at execution, never at a delayed completion or cache read.
			if (
				this.pending.get(key)?.work === work &&
				this.now() - startedAt < maxAgeMs &&
				bytes <= this.limits.entryBytes &&
				bytes <= this.limits.bytes
			) {
				this.delete(key)
				while (
					this.entries.size &&
					(this.entries.size >= this.limits.entries || this.bytes + bytes > this.limits.bytes)
				)
					this.delete(this.entries.keys().next().value!)
				if (this.limits.entries > 0) {
					this.entries.set(key, { value: structuredClone(value), storedAt: startedAt, bytes })
					this.bytes += bytes
				}
			}
			return value
		})
		this.pending.set(key, { work, startedAt })
		try {
			return structuredClone(await work)
		} finally {
			// Older work may settle after a refresh has installed a new entry or pending request.
			if (this.pending.get(key)?.work === work) this.pending.delete(key)
		}
	}
}

/** Object key order does not change query meaning; array order does. Inputs already passed typed schemas. */
export function analyticsCacheKey(value: unknown): string {
	return createHash('sha256')
		.update(
			JSON.stringify(value, (_key, item: unknown) => {
				if (item && typeof item === 'object' && !Array.isArray(item))
					return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
				return item
			})
		)
		.digest('hex')
}
