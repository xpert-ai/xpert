import {
	DynamicModule,
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
import { PluginModule } from '../plugin/plugin.module';

const baseDir = getConfig().assetOptions.serverRoot

/**
 * Built-in XpertPlugins to load at startup.
 * These are first-party plugins bundled with the server.
 */
const BUILTIN_PLUGINS: string[] = [
	'@xpert-ai/plugin-agent-middlewares', // Built-in Agent middlewares
	'@xpert-ai/plugin-integration-lark',  // Lark integration plugin
];

@Module({})
export class BootstrapModule implements NestModule, OnApplicationShutdown {
	/**
	 * Create the bootstrap module with optional built-in plugins.
	 *
	 * @param builtinPlugins - Override the default built-in plugins list
	 */
	static async forRootAsync(builtinPlugins: string[] = BUILTIN_PLUGINS): Promise<DynamicModule> {
		const pluginModule = await PluginModule.initAsync(builtinPlugins);

		return {
			module: BootstrapModule,
			imports: [
				provideCacheModule(),
				provideBullModule(),
				provideEventEmitterModule(),
				provideScheduleModule(),
				provideI18nModule(baseDir),
				ConfigModule,
				ServerAppModule,
				LoggerModule.forRoot(),
				pluginModule,
			]
		};
	}

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
