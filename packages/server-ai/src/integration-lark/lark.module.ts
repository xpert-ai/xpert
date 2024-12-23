import { IntegrationModule, RoleModule, UserModule } from '@metad/server-core'
import { CacheModule, CacheStore, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { CqrsModule } from '@nestjs/cqrs'
import { redisStore } from 'cache-manager-redis-yet'
import { RouterModule } from 'nest-router'
import { LarkTokenStrategy } from './auth/lark-token.strategy'
import { CommandHandlers } from './commands/handlers'
import { LarkConversationService } from './conversation.service'
import { LarkHooksController } from './lark.hooks.controller'
import { LarkService } from './lark.service'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/lark', module: IntegrationLarkModule }]),
		CacheModule.registerAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => {
				const host = configService.get('REDIS_HOST') || 'localhost'
				const port = configService.get('REDIS_PORT') || 6379
				// const username = configService.get('REDIS.USERNAME') || ''
				const password = configService.get('REDIS_PASSWORD') || ''

				const store = await redisStore({
					socket: {
						host,
						port,
					},
					password
				})

				return {
					store: store as unknown as CacheStore,
					ttl: 3 * 60000 // 3 minutes (milliseconds)
					// ttl: configService.get('CACHE_TTL'),
				}
			},
			inject: [ConfigService]
		}),
		CqrsModule,
		UserModule,
		RoleModule,
		IntegrationModule
	],
	controllers: [LarkHooksController],
	providers: [LarkService, LarkConversationService, ...CommandHandlers, LarkTokenStrategy],
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
