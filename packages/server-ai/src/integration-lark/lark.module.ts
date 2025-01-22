import { IntegrationModule, REDIS_OPTIONS, RedisModule, RoleModule, UserModule } from '@metad/server-core'
import { CacheModule, CacheStore, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { redisStore } from 'cache-manager-redis-yet'
import { RedisOptions } from 'ioredis'
import { RouterModule } from 'nest-router'
import { LarkTokenStrategy } from './auth/lark-token.strategy'
import { CommandHandlers } from './commands/handlers'
import { LarkConversationService } from './conversation.service'
import { LarkHooksController } from './lark.hooks.controller'
import { LarkService } from './lark.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/lark', module: IntegrationLarkModule }]),
		CacheModule.registerAsync({
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
					ttl: 3 * 60000 // 3 minutes (milliseconds)
					// ttl: configService.get('CACHE_TTL'),
				}
			},
			inject: [REDIS_OPTIONS]
		}),
		RedisModule,
		CqrsModule,
		UserModule,
		RoleModule,
		IntegrationModule
	],
	controllers: [LarkHooksController],
	providers: [LarkService, LarkConversationService, ...CommandHandlers, ...QueryHandlers, LarkTokenStrategy],
	exports: [LarkService]
})
export class IntegrationLarkModule {}
//  implements NestModule {
// 	/**
// 	 *
// 	 * @param consumer
// 	 */
// 	configure(consumer: MiddlewareConsumer) {
// 		// Apply middlewares to specific controllers
// 		consumer.apply(LarkMiddleware).forRoutes(LarkHooksController)
// 	}
// }
