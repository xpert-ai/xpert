import { IntegrationModule, RedisModule, RoleModule, UserModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { LarkTokenStrategy } from './auth/lark-token.strategy'
import { CommandHandlers } from './commands/handlers'
import { LarkConversationService } from './conversation.service'
import { LarkHooksController } from './lark.hooks.controller'
import { LarkService } from './lark.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/lark', module: IntegrationLarkModule }]),
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
