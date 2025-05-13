import {
	MiddlewareConsumer,
	Module,
	NestModule,
	OnApplicationShutdown
} from '@nestjs/common';
import { ConfigModule, getConfig } from '@metad/server-config';
import * as path from 'path'
import { ServerAppModule } from './../server.module';
import { HealthIndicatorModule } from '../health-indicator';
import { Logger, LoggerModule } from '../logger';
import { provideCacheModule } from './cache';
import { provideBullModule } from './bull';
import { provideEventEmitterModule } from './event';
import { provideScheduleModule } from './task';
import { provideI18nModule } from './i18n';

const baseDir = path.join(__dirname, '../../../')

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
		HealthIndicatorModule
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
