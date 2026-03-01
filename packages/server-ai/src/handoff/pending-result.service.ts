import { Injectable, Logger } from '@nestjs/common'

const DEFAULT_PENDING_TIMEOUT_MS =
	parseInt(process.env.XPERT_HANDOFF_PENDING_TIMEOUT_MS || '', 10) || 2 * 60 * 1000

interface PendingWaitOptions {
	timeoutMs?: number
	onEvent?: (event: unknown) => void
}

interface PendingEntry<T = unknown> {
	resolve: (value: T) => void
	reject: (reason?: unknown) => void
	onEvent?: (event: unknown) => void
	timeout?: NodeJS.Timeout
	settled: boolean
}

/**
 * Process-local pending registry:
 * correlate queue message id -> awaiting caller callbacks (resolve/reject/emit).
 *
 * This is intentionally best-effort and in-memory only.
 */
@Injectable()
export class HandoffPendingResultService {
	readonly #logger = new Logger(HandoffPendingResultService.name)
	readonly #pending = new Map<string, PendingEntry>()

	waitFor<T = unknown>(id: string, options?: PendingWaitOptions): Promise<T> {
		if (!id) {
			throw new Error('Pending id is required')
		}
		if (this.#pending.has(id)) {
			throw new Error(`Pending id already exists: ${id}`)
		}

		const timeoutMs = Math.max(0, options?.timeoutMs ?? DEFAULT_PENDING_TIMEOUT_MS)

		return new Promise<T>((resolve, reject) => {
			const entry: PendingEntry<T> = {
				settled: false,
				onEvent: options?.onEvent,
				resolve: (value: T) => {
					if (entry.settled) return
					entry.settled = true
					if (entry.timeout) clearTimeout(entry.timeout)
					this.#pending.delete(id)
					resolve(value)
				},
				reject: (reason?: unknown) => {
					if (entry.settled) return
					entry.settled = true
					if (entry.timeout) clearTimeout(entry.timeout)
					this.#pending.delete(id)
					reject(reason)
				}
			}

			if (timeoutMs > 0) {
				entry.timeout = setTimeout(() => {
					entry.reject(
						new Error(`Pending result timeout after ${timeoutMs}ms for message "${id}"`)
					)
				}, timeoutMs)
			}

			this.#pending.set(id, entry)
		})
	}

	resolve<T = unknown>(id: string, value: T): boolean {
		const entry = this.#pending.get(id) as PendingEntry<T> | undefined
		if (!entry) {
			return false
		}
		entry.resolve(value)
		return true
	}

	reject(id: string, reason?: unknown): boolean {
		const entry = this.#pending.get(id)
		if (!entry) {
			return false
		}
		entry.reject(reason)
		return true
	}

	publish(id: string, event: unknown): boolean {
		const entry = this.#pending.get(id)
		if (!entry || entry.settled || !entry.onEvent) {
			return false
		}

		try {
			entry.onEvent(event)
		} catch (error) {
			this.#logger.warn(
				`Pending event callback failed for message "${id}": ${(error as Error)?.message ?? error}`
			)
		}
		return true
	}

	cancel(id: string, reason: string = 'pending canceled'): boolean {
		return this.reject(id, new Error(reason))
	}

	clearAll(reason: string = 'pending registry cleared') {
		for (const id of this.#pending.keys()) {
			this.cancel(id, reason)
		}
	}

	size(): number {
		return this.#pending.size
	}
}

