import { CacheModule } from '@nestjs/cache-manager'
import { createKeyv } from '@keyv/redis'
import { RedisOptions } from 'ioredis'
import { REDIS_OPTIONS, RedisModule } from '../core/redis.module'

/**
 * https://docs.nestjs.com/techniques/caching
 * 
 * @returns 
 */
export function provideCacheModule() {
    return CacheModule.registerAsync({
        isGlobal: true,
        imports: [RedisModule],
        useFactory: async (redisOptions: RedisOptions) => {
            const store = createKeyv({
                socket: {
                    host: redisOptions.host,
                    port: redisOptions.port
                },
                username: redisOptions.username,
                password: redisOptions.password
            })

            return {
                stores: [
                    store
                ],
                ttl: 3 * 60 // 3 minutes
                // ttl: configService.get('CACHE_TTL'),
            }
        },
        inject: [REDIS_OPTIONS]
    })
}