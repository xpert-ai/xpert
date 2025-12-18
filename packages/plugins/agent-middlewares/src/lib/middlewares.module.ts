import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { CqrsModule } from '@nestjs/cqrs';
import chalk from 'chalk';
import { TodoListMiddleware } from './todoListMiddleware';
import { SummarizationMiddleware } from './summarization';
import { ModalFallbackMiddleware } from './modalfallback';
import { ToolCallLimitMiddleware } from './toolCallLimit';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [CqrsModule],
	/**
	 * An array of Entity classes. The plugin (or ORM) will
	 * register these entities for use within the application.
	 */
	entities: [],

    providers: [
		SummarizationMiddleware,
        TodoListMiddleware,
        ModalFallbackMiddleware,
        ToolCallLimitMiddleware,
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
