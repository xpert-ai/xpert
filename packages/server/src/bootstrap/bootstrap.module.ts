import {
	MiddlewareConsumer,
	Module,
	NestModule,
	OnApplicationShutdown
} from '@nestjs/common';
import { ConfigModule, getConfig } from '@metad/server-config';
import { ServerAppModule } from './../server.module';
import { Logger, LoggerModule } from '../logger';
import { provideCacheModule } from './cache';
import { provideBullModule } from './bull';
import { provideEventEmitterModule } from './event';
import { provideScheduleModule } from './task';
import { provideI18nModule } from './i18n';

const baseDir = getConfig().assetOptions.serverRoot

@Module({
	imports: [
		provideCacheModule(),
		provideBullModule(),
		provideEventEmitterModule(),
		provideScheduleModule(),
		provideI18nModule(baseDir),
		ConfigModule,
		ServerAppModule,
		LoggerModule.forRoot(),
		// PluginModule.forRoot(getConfig()),
	]
})
export class BootstrapModule implements NestModule, OnApplicationShutdown {
	constructor() {}

	configure(consumer: MiddlewareConsumer) {
		consumer.apply().forRoutes('*');
	}

	async onApplicationShutdown(signal: string) {
		if (signal) {
			Logger.log(`Received shutdown signal: ${signal}`);
		}
	}
}
