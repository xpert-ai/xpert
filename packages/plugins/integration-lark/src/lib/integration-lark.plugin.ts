import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule } from '@nestjs/core'

import { LarkService } from './lark.service'
import { LarkChannelStrategy } from './lark-channel.strategy'
import { LarkIntegrationStrategy } from './lark-integration.strategy'
import { LarkHooksController } from './lark.hooks.controller'
import { LarkConversationService } from './conversation.service'
import { LarkTokenStrategy } from './auth/lark-token.strategy'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { LarkExecutionQueueService } from './lark-execution-queue.service'
import { LarkChannelRuntimeManager } from './lark-channel-runtime.manager'
import { LarkHandoffTaskProcessor } from './lark-handoff.processor'

@XpertServerPlugin({
	imports: [
		DiscoveryModule,
		CqrsModule
	],
	controllers: [LarkHooksController],
	providers: [
		LarkService,
		LarkExecutionQueueService,
		LarkChannelRuntimeManager,
		LarkConversationService,
		LarkHandoffTaskProcessor,
		LarkChannelStrategy,
		LarkIntegrationStrategy,
		...CommandHandlers,
		...QueryHandlers,
		LarkTokenStrategy
	],
	exports: [
		LarkService,
		LarkExecutionQueueService,
		LarkChannelRuntimeManager,
		LarkChannelStrategy,
		LarkIntegrationStrategy
	]
})
export class IntegrationLarkPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	private logEnabled = true

	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationLarkPlugin.name} is being bootstrapped...`))
		}
	}

	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationLarkPlugin.name} is being destroyed...`))
		}
	}
}
