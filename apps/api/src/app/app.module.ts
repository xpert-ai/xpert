import { Module } from '@nestjs/common'
import {
	AnalyticsModule,
} from '@xpert-ai/analytics'
import { ConfigModule, getConfig } from '@xpert-ai/server-config'
import {
	provideBullModule,
	provideCacheModule,
	provideEventEmitterModule,
	provideI18nModule,
	providePinoLoggerModule,
	provideScheduleModule,
	PluginModule,
	RedisModule,
	SeederModule,
	ServerAppModule
} from '@xpert-ai/server-core'

const baseDir = getConfig().assetOptions.serverRoot

@Module({
	imports: [
		ConfigModule,
		RedisModule,
		providePinoLoggerModule(),
		provideCacheModule(),
		provideBullModule(),
		provideI18nModule(baseDir),
		provideEventEmitterModule(),
		provideScheduleModule(),
		PluginModule.init(),
		ServerAppModule,
		AnalyticsModule,
    	SeederModule
	],
	controllers: [],
	providers: []
})
export class AppModule {}
