import chalk from 'chalk';
import { RouterModule } from '@nestjs/core';
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { FirecrawlSourceStrategy } from './source.strategy';
import { FirecrawlIntegrationStrategy } from './integration.strategy';
import { FirecrawlController } from './firecrawl.controller';
import { FirecrawlService } from './firecrawl.service';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [
		RouterModule.register([{ path: '/firecrawl', module: FirecrawlPlugin }]),
	],
	/**
	 * An array of Entity classes. The plugin (or ORM) will
	 * register these entities for use within the application.
	 */
	entities: [],

	providers: [
		FirecrawlIntegrationStrategy,
		FirecrawlSourceStrategy,
		FirecrawlService
	],

	controllers: [
		FirecrawlController
	]
})
export class FirecrawlPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${FirecrawlPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${FirecrawlPlugin.name} is being destroyed...`));
		}
	}
}
