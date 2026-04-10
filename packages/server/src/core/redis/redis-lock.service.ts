import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { RedisClientType } from 'redis'
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

@Injectable()
export class RedisLockService {
	@Inject(REDIS_CLIENT)
	private redis: RedisClientType

	// Try to acquire lock
	async acquireLock(key: string, ttl = 30000): Promise<string | null> {
		const normalizedKey = normalizeLockValue(key)
		if (!normalizedKey) {
			return null
		}
		const lockId = randomUUID()
		const result = await this.redis.set(normalizedKey, lockId, {
			PX: Math.max(0, Math.floor(ttl)),
			NX: true
		})
		return result === 'OK' ? lockId : null
	}

	// Release lock (only if lockId matches)
	async releaseLock(key: string, lockId: string): Promise<boolean> {
		const normalizedKey = normalizeLockValue(key)
		const normalizedLockId = normalizeLockValue(lockId)
		if (!normalizedKey || !normalizedLockId) {
			return false
		}
		const result = await this.redis.eval(RELEASE_LOCK_SCRIPT, {
			keys: [normalizedKey],
			arguments: [normalizedLockId]
		})
		return result === 1
	}

	// Refresh lock TTL (only if lockId matches)
	async refreshLock(key: string, lockId: string, ttl: number): Promise<boolean> {
		const normalizedKey = normalizeLockValue(key)
		const normalizedLockId = normalizeLockValue(lockId)
		if (!normalizedKey || !normalizedLockId) {
			return false
		}
		const result = await this.redis.eval(REFRESH_LOCK_SCRIPT, {
			keys: [normalizedKey],
			arguments: [normalizedLockId, `${Math.max(0, Math.floor(ttl))}`]
		})
		return result === 1
	}
}

function normalizeLockValue(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return null
	}
	const normalized = value.trim()
	return normalized ? normalized : null
}
