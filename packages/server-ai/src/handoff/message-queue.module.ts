import { BullModule } from '@nestjs/bull'
import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { RedisModule } from '@metad/server-core'
import { ConfigModule } from '@metad/server-config'
import { HANDOFF_QUEUE_SERVICE_TOKEN, HandoffProcessorRegistry } from '@xpert-ai/plugin-sdk'
import {
	XPERT_HANDOFF_QUEUE,
	XPERT_HANDOFF_QUEUE_BATCH,
	XPERT_HANDOFF_QUEUE_INTEGRATION,
	XPERT_HANDOFF_QUEUE_REALTIME
} from './constants'
import { HandoffQueueGatewayService } from './dispatcher/handoff-queue-gateway.service'
import { HandoffRouteResolver } from './dispatcher/handoff-route-resolver.service'
import { HandoffRoutingConfigService } from './dispatcher/handoff-routing-config.service'
import { HandoffDeadService } from './dead-letter.service'
import { registerHandoffPluginServicePermissionHandler } from './handoff-permission'
import { MessageDispatcherService } from './message-dispatcher.service'
import {
	HandoffQueueBatchProcessor,
	HandoffQueueIntegrationProcessor,
	HandoffQueueProcessor,
	HandoffQueueRealtimeProcessor
} from './message-queue.processor'
import { HandoffQueueService } from './message-queue.service'
import { HandoffPendingResultService } from './pending-result.service'
import { CommandHandlers } from './commands/handlers'
import { LocalQueueTaskService } from './local-sync-task.service'
import { Processors } from './plugins'
import { HandoffCancelService } from './handoff-cancel.service'

@Global()
@Module({
	imports: [
		DiscoveryModule,
		CqrsModule,
		RedisModule,
		ConfigModule,
		BullModule.registerQueue(
			{
				name: XPERT_HANDOFF_QUEUE
			},
			{
				name: XPERT_HANDOFF_QUEUE_REALTIME
			},
			{
				name: XPERT_HANDOFF_QUEUE_BATCH
			},
			{
				name: XPERT_HANDOFF_QUEUE_INTEGRATION
			}
		)
	],
	providers: [
		HandoffProcessorRegistry,
		MessageDispatcherService,
		HandoffDeadService,
		HandoffPendingResultService,
		HandoffRoutingConfigService,
		HandoffRouteResolver,
		HandoffQueueGatewayService,
		HandoffQueueService,
		HandoffCancelService,
		{ provide: HANDOFF_QUEUE_SERVICE_TOKEN, useExisting: HandoffQueueService },
		HandoffQueueProcessor,
		HandoffQueueRealtimeProcessor,
		HandoffQueueBatchProcessor,
		HandoffQueueIntegrationProcessor,
		LocalQueueTaskService,
		...Processors,
		...CommandHandlers
	],
	exports: [HandoffQueueService]
})
export class HandoffQueueModule {
	constructor() {
		registerHandoffPluginServicePermissionHandler()
	}
}
