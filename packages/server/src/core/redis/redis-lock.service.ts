import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Redis } from 'ioredis'
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
	private redis: Redis

	// Try to acquire lock
	async acquireLock(key: string, ttl = 30000): Promise<string | null> {
		const lockId = randomUUID()
		const result = await this.redis.set(key, lockId, 'PX', ttl, 'NX')
		return result === 'OK' ? lockId : null
	}

	// Release lock (only if lockId matches)
	async releaseLock(key: string, lockId: string): Promise<boolean> {
		const result = await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, lockId)
		return result === 1
	}

	// Refresh lock TTL (only if lockId matches)
	async refreshLock(key: string, lockId: string, ttl: number): Promise<boolean> {
		const result = await this.redis.eval(REFRESH_LOCK_SCRIPT, 1, key, lockId, `${ttl}`)
		return result === 1
	}
}
