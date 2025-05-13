import { CacheModule, CacheStore } from '@nestjs/common'
import { redisStore } from 'cache-manager-redis-yet'
import { RedisOptions } from 'ioredis'
import { REDIS_OPTIONS, RedisModule } from '../core/redis.module'

/**
 * https://docs.nestjs.com/v8/techniques/caching
 * 
 * @returns 
 */
export function provideCacheModule() {
    return CacheModule.registerAsync({
        isGlobal: true,
        imports: [RedisModule],
        useFactory: async (redisOptions: RedisOptions) => {
            const store = await redisStore({
                socket: {
                    host: redisOptions.host,
                    port: redisOptions.port
                },
                username: redisOptions.username,
                password: redisOptions.password
            })

            return {
                store: store as unknown as CacheStore,
                ttl: 3 * 60 // 3 minutes
                // ttl: configService.get('CACHE_TTL'),
            }
        },
        inject: [REDIS_OPTIONS]
    })
}