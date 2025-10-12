import chalk from 'chalk';
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { RouterModule } from '@nestjs/core'
import { FastGPTController } from './fastgpt.controller';
import { FastGPTService } from './fastgpt.service';
import { FastGPTIntegrationStrategy } from './fastgpt-integration.strategy';
import { FastGPTKnowledgeStrategy } from './fastgpt-knowledge.strategy';

@XpertServerPlugin({
	
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [
		RouterModule.register([{ path: '/fastgpt', module: IntegrationFastGPTPlugin }])
	],
	/**
	 * An array of Entity classes. The plugin (or ORM) will
	 * register these entities for use within the application.
	 */
	entities: [],
	controllers: [FastGPTController],
	providers: [FastGPTService, FastGPTIntegrationStrategy, FastGPTKnowledgeStrategy],
})
export class IntegrationFastGPTPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationFastGPTPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationFastGPTPlugin.name} is being destroyed...`));
		}
	}
}
