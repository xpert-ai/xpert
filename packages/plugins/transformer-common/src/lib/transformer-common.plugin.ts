import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import chalk from 'chalk';
import { DefaultTransformerStrategy } from './transformer.strategy';
import { TextTransformerStrategy } from './text-transformer.strategy';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [ConfigModule],

	providers: [
		DefaultTransformerStrategy,
		TextTransformerStrategy
	]
})
export class DefaultTransformerPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${DefaultTransformerPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${DefaultTransformerPlugin.name} is being destroyed...`));
		}
	}
}
