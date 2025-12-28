import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { CqrsModule } from '@nestjs/cqrs';
import chalk from 'chalk';
import { TodoListMiddleware } from './todoListMiddleware';
import { SummarizationMiddleware } from './summarization';
import { HumanInTheLoopMiddleware } from './hitl';
import { ClientToolMiddleware } from './clientTool';
import { ClientEffectMiddleware } from './clientEffect';
import { LLMToolSelectorNameMiddleware } from './llmToolSelector';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [CqrsModule],

    providers: [
		SummarizationMiddleware,
        TodoListMiddleware,
		HumanInTheLoopMiddleware,
		LLMToolSelectorNameMiddleware,
		ClientToolMiddleware,
		ClientEffectMiddleware,
    ],
})
export class AgentMiddlewaresModule implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${AgentMiddlewaresModule.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${AgentMiddlewaresModule.name} is being destroyed...`));
		}
	}
}
