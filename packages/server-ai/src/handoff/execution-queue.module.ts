import { Global, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { DiscoveryModule } from '@nestjs/core'
import { ExecutionQueueCoreModule } from './execution-queue-core.module'
import {
	HandoffDeadLetterService,
	HandoffPendingResultService,
	HandoffQueueProcessor,
	HandoffQueueService,
	MessageDispatcherService,
	XPERT_HANDOFF_QUEUE
} from './dispatcher'
import { HandoffProcessorRegistry } from './processor'
import { LocalQueueTaskProcessor } from './local-queue-task.processor'
import { LocalQueueTaskService } from './local-queue-task.service'

const providers = [
	HandoffProcessorRegistry,
	LocalQueueTaskService,
	LocalQueueTaskProcessor,
	MessageDispatcherService,
	HandoffDeadLetterService,
	HandoffPendingResultService,
	HandoffQueueService,
	HandoffQueueProcessor
]

@Global()
@Module({
	imports: [
		ExecutionQueueCoreModule,
		DiscoveryModule,
		BullModule.registerQueue({
			name: XPERT_HANDOFF_QUEUE
		})
	],
	providers,
	exports: [ExecutionQueueCoreModule, ...providers]
})
export class ExecutionQueueModule {}
