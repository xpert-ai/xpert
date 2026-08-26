import { Inject, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { RedisClientType } from 'redis'
import { getErrorMessage } from '@xpert-ai/server-common'
import { REDIS_CLIENT } from './types'

const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1]
  then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`

const REFRESH_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1]
  then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`

export type RedisLockRunResult<T> = { acquired: false } | { acquired: true; value: T }

@Injectable()
export class RedisLockService {
	readonly #logger = new Logger(RedisLockService.name)

	@Inject(REDIS_CLIENT)
	private redis: RedisClientType

	// Try to acquire lock
	async acquireLock(key: string, ttl = 30000): Promise<string | null> {
		const lockId = randomUUID()
		const result = await this.redis.set(key, lockId, { PX: ttl, NX: true })
		return result === 'OK' ? lockId : null
	}

	// Release lock (only if lockId matches)
	async releaseLock(key: string, lockId: string): Promise<boolean> {
		const result = await this.redis.eval(RELEASE_LOCK_SCRIPT, {
			keys: [key],
			arguments: [lockId]
		})
		return result === 1
	}

	// Refresh lock TTL (only if lockId matches)
	async refreshLock(key: string, lockId: string, ttl: number): Promise<boolean> {
		const result = await this.redis.eval(REFRESH_LOCK_SCRIPT, {
			keys: [key],
			arguments: [lockId, `${ttl}`]
		})
		return result === 1
	}

	async runWithLock<T>(key: string, ttl: number, operation: () => Promise<T>): Promise<RedisLockRunResult<T>> {
		let acquiredLockId: string | null
		try {
			acquiredLockId = await this.acquireLock(key, ttl)
		} catch (error) {
			this.#logger.warn(`Redis lock '${key}' unavailable: ${getErrorMessage(error)}`)
			return { acquired: false }
		}
		if (!acquiredLockId) {
			return { acquired: false }
		}
		const lockId = acquiredLockId

		let refreshInFlight: Promise<void> | null = null
		const refreshInterval = setInterval(
			() => {
				if (refreshInFlight) {
					return
				}
				refreshInFlight = this.refreshLock(key, lockId, ttl)
					.then((refreshed) => {
						if (!refreshed) {
							this.#logger.warn(`Redis lock '${key}' was lost while the operation was still running`)
						}
					})
					.catch((error) => {
						this.#logger.warn(`Redis lock '${key}' refresh failed: ${getErrorMessage(error)}`)
					})
					.finally(() => {
						refreshInFlight = null
					})
			},
			Math.max(1, Math.floor(ttl / 3))
		)
		refreshInterval.unref()

		try {
			return { acquired: true, value: await operation() }
		} finally {
			clearInterval(refreshInterval)
			if (refreshInFlight) {
				await refreshInFlight
			}
			try {
				const released = await this.releaseLock(key, lockId)
				if (!released) {
					this.#logger.warn(`Redis lock '${key}' was not released because ownership had changed`)
				}
			} catch (error) {
				this.#logger.warn(`Redis lock '${key}' release failed: ${getErrorMessage(error)}`)
			}
		}
	}
}
