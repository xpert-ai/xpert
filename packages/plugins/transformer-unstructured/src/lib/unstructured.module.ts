import { ConfigModule } from '@nestjs/config'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import chalk from 'chalk';
import { UnstructuredTransformerStrategy } from './unstructured.strategy';
import { UnstructuredIntegrationStrategy } from './integration.strategy';
import { UnstructuredController } from './unstructured.controller';
import { UnstructuredService } from './unstructured.service';

@XpertServerPlugin({
	imports: [
		ConfigModule
	],
	controllers: [
		UnstructuredController,
	],
	providers: [
		UnstructuredService,
		UnstructuredIntegrationStrategy,
		UnstructuredTransformerStrategy,
	]
})
export class UnstructuredPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${UnstructuredPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${UnstructuredPlugin.name} is being destroyed...`));
		}
	}
}
