import { ServerAIModule } from '@metad/server-ai'
import { provideBullModule, provideCacheModule, SeederModule, ServerAppModule } from '@metad/server-core'
import { Logger, MiddlewareConsumer, Module, NestModule, OnApplicationShutdown } from '@nestjs/common'
import { AnalyticsModule } from '../app.module'
export * from '../ai/index'

@Module({
	imports: [provideCacheModule(), provideBullModule(), ServerAppModule, ServerAIModule, AnalyticsModule, SeederModule]
})
export class BootstrapModule implements NestModule, OnApplicationShutdown {
	constructor() {}

	configure(consumer: MiddlewareConsumer) {
		consumer.apply().forRoutes('*')
	}

	async onApplicationShutdown(signal: string) {
		if (signal) {
			Logger.log(`Received shutdown signal: ${signal}`)
		}
	}
}
