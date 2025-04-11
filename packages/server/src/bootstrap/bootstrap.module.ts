import {
	MiddlewareConsumer,
	Module,
	NestModule,
	OnApplicationShutdown
} from '@nestjs/common';
import { ConfigModule, getConfig } from '@metad/server-config';
import { ServerAppModule } from './../server.module';
import { HealthIndicatorModule } from '../health-indicator';
import { Logger, LoggerModule } from '../logger';
import { provideCacheModule } from './cache';
import { provideBullModule } from './bull';

@Module({
	imports: [
		provideCacheModule(),
		provideBullModule(),
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
