import chalk from 'chalk';
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { LarkIntegrationStrategy } from './integration.strategy';
import { LarkController } from './lark.controller';
import { LarkSourceStrategy } from './source.strategy';

@XpertServerPlugin({
	imports: [
	],
	entities: [],
	controllers: [
		LarkController
	],
	providers: [
		LarkIntegrationStrategy,
		LarkSourceStrategy
	]
})
export class LarkModule implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${LarkModule.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${LarkModule.name} is being destroyed...`));
		}
	}
}
