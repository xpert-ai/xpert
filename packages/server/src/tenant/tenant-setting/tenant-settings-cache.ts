// Cache calls cannot be cancelled: stop adding work while timed-out calls remain pending.
// Settings remain authoritative in the database; Redis is only an optimization here.
const CACHE_TIMEOUT_MS = 250
const CACHE_FAILURE_BACKOFF_MS = 5_000
const MAX_PENDING_CACHE_OPERATIONS = 32

export class TenantSettingsCache {
	private pending = 0
	private stalled = 0
	private blockedUntil = 0

	async run<T>(operation: () => Promise<T>): Promise<T | undefined> {
		if (this.stalled || this.pending >= MAX_PENDING_CACHE_OPERATIONS || Date.now() < this.blockedUntil) {
			return undefined
		}
		this.pending++

		return new Promise<T | undefined>((resolve) => {
			let timedOut = false
			const timer = setTimeout(() => {
				timedOut = true
				this.stalled++
				resolve(undefined)
			}, CACHE_TIMEOUT_MS)
			const finish = () => {
				clearTimeout(timer)
				this.pending--
				if (timedOut) this.stalled--
			}
			Promise.resolve()
				.then(operation)
				.then(
					(value) => {
						finish()
						resolve(value)
					},
					() => {
						this.blockedUntil = Date.now() + CACHE_FAILURE_BACKOFF_MS
						finish()
						resolve(undefined)
					}
				)
		})
	}
}
