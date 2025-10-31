import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import chalk from 'chalk';
import { VolcengineProviderStrategy } from './provider.strategy';
import { VolcengineLargeLanguageModel } from './llm/llm';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [ConfigModule],

	providers: [
		VolcengineProviderStrategy,
		VolcengineLargeLanguageModel
	]
})
export class VolcenginePlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${VolcenginePlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${VolcenginePlugin.name} is being destroyed...`));
		}
	}
}
