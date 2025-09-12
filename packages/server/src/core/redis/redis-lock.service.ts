import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Redis } from 'ioredis'
import { REDIS_CLIENT } from './types'

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
		const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] 
      then 
        return redis.call("del", KEYS[1]) 
      else 
        return 0 
      end
    `
		const result = await this.redis.eval(script, 1, key, lockId)
		return result === 1
	}
}
