import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'

import { LarkChannelStrategy } from './lark-channel.strategy'
import { LarkIntegrationStrategy } from './lark-integration.strategy'
import { LarkHooksController } from './lark.controller'
import { LarkConversationService } from './conversation.service'
import { LarkTokenStrategy } from './auth/lark-token.strategy'
import {
	LarkChatDispatchService,
	LarkChatRunStateService,
	LarkChatStreamCallbackProcessor,
} from './handoff'
import { LarkConversationBindingEntity } from './entities/lark-conversation-binding.entity'
import { LarkTriggerBindingEntity } from './entities/lark-trigger-binding.entity'
import { ChatBILarkMiddleware, LarkNotifyMiddleware } from './middlewares'
import { LarkTriggerStrategy } from './workflow/lark-trigger.strategy'

@XpertServerPlugin({
	imports: [
		DiscoveryModule,
		CqrsModule,
		TypeOrmModule.forFeature([LarkConversationBindingEntity, LarkTriggerBindingEntity]),
	],
	entities: [LarkConversationBindingEntity, LarkTriggerBindingEntity],
	controllers: [LarkHooksController],
	providers: [
		LarkConversationService,
		LarkChannelStrategy,
		LarkIntegrationStrategy,
		LarkTriggerStrategy,
		LarkChatDispatchService,
		LarkChatRunStateService,
		LarkChatStreamCallbackProcessor,
		LarkTokenStrategy,
		ChatBILarkMiddleware,
		LarkNotifyMiddleware
	],
	exports: [
		LarkChannelStrategy,
		LarkIntegrationStrategy,
		LarkTriggerStrategy,
		LarkChatDispatchService,
		ChatBILarkMiddleware,
		LarkNotifyMiddleware
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
