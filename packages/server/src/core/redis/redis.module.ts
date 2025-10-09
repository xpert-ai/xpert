import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import * as Redis from 'ioredis'
import { createClient } from 'redis'
import { RedisLockService } from './redis-lock.service'
import { REDIS_CLIENT, REDIS_OPTIONS } from './types'



@Module({
	imports: [ConfigModule],
	providers: [
		{
			inject: [ConfigService],
			provide: REDIS_OPTIONS,
			useFactory: async (configService: ConfigService) => {
				return {
					host: configService.get('REDIS_HOST') || 'localhost',
					port: configService.get('REDIS_PORT') || 6379,
					username: configService.get('REDIS.USERNAME') || '',
					password: configService.get('REDIS_PASSWORD') || ''
				} as Redis.RedisOptions
			}
		},
		{
			inject: [ConfigService],
			provide: REDIS_CLIENT,
			useFactory: async (configService: ConfigService) => {
				const host = configService.get('REDIS_HOST') || 'localhost'
				const port = configService.get('REDIS_PORT') || 6379
				// const username = configService.get('REDIS.USERNAME') || ''
				const password = configService.get('REDIS_PASSWORD') || ''

				const client = createClient({
					url: `redis://@${host}:${port}`,
					// username,
					password
				})
				await client.connect()
				return client
			}
		},
		RedisLockService
	],
	exports: [REDIS_OPTIONS, REDIS_CLIENT, RedisLockService]
})
export class RedisModule {}
