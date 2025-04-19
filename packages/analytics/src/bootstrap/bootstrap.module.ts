import { ServerAIModule } from '@metad/server-ai'
import {
	provideBullModule,
	provideCacheModule,
	provideI18nModule,
	SeederModule,
	ServerAppModule
} from '@metad/server-core'
import { Logger, MiddlewareConsumer, Module, NestModule, OnApplicationShutdown } from '@nestjs/common'
import * as path from 'path'
import { AnalyticsModule } from '../app.module'
export * from '../ai/index'

const baseDir = path.join(__dirname, '../../../')

@Module({
	imports: [
		provideCacheModule(),
		provideBullModule(),
		provideI18nModule(baseDir),
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
