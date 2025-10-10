import { ServerAIModule } from '@metad/server-ai'
import {
	provideBullModule,
	provideCacheModule,
	provideEventEmitterModule,
	provideI18nModule,
	provideScheduleModule,
	RedisModule,
	SeederModule,
	ServerAppModule
} from '@metad/server-core'
import { ConfigModule, getConfig } from '@metad/server-config'
import { Logger, MiddlewareConsumer, Module, NestModule, OnApplicationShutdown } from '@nestjs/common'
import { AnalyticsModule } from '../app.module'
export * from '../ai/index'

const baseDir = getConfig().assetOptions.serverRoot

@Module({
	imports: [
		ConfigModule,
		RedisModule,
		provideCacheModule(),
		provideBullModule(),
		provideI18nModule(baseDir),
		provideEventEmitterModule(),
		provideScheduleModule(),
		ServerAppModule,
		ServerAIModule,
		AnalyticsModule,
		SeederModule
	]
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
