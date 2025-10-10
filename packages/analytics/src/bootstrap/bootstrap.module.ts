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
import { Global, Logger, MiddlewareConsumer, Module, NestModule, OnApplicationShutdown } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { AnalyticsModule } from '../app.module'
export * from '../ai/index'

const baseDir = getConfig().assetOptions.serverRoot

@Global()
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
	],
	exports: [
		ScheduleModule
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
