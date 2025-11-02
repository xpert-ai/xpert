import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import chalk from 'chalk';
import { VLLMProviderStrategy } from './provider.strategy';
import { VLLMLargeLanguageModel } from './llm/llm';
import { VLLMRerankModel } from './rerank/rerank';
import { VLLMTextEmbeddingModel } from './text-embedding/text-embedding';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [ConfigModule],

	providers: [
        VLLMProviderStrategy,
        VLLMLargeLanguageModel,
		VLLMRerankModel,
		VLLMTextEmbeddingModel
	]
})
export class VLLMPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${VLLMPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${VLLMPlugin.name} is being destroyed...`));
		}
	}
}
