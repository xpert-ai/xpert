import { BullModule } from '@nestjs/bullmq'
import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { MANAGED_QUEUE_HANDLER_REGISTRY_TOKEN, MANAGED_QUEUE_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import type { RedisOptions } from 'ioredis'
import { RedisModule } from '../core/redis'
import { REDIS_OPTIONS } from '../core/redis/types'
import {
	MANAGED_QUEUE_PHYSICAL_QUEUE_NAME,
	MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX,
	MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME
} from './constants'
import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'
import { ManagedQueueHandlerExplorerService } from './managed-queue-handler-explorer.service'
import {
	ManagedQueueProcessor,
	SandboxBrowserManagedQueueProcessor,
	managedQueuePoolAutorun
} from './managed-queue.processor'
import { ManagedQueueService } from './managed-queue.service'

// Do not instantiate an inactive BullMQ Worker: even autorun=false opens a
// worker-named Redis connection and would make getWorkersCount() a false
// positive. Process roles therefore control provider registration as well.
const MANAGED_QUEUE_PROCESSOR_PROVIDERS = [
	...(managedQueuePoolAutorun('default') ? [ManagedQueueProcessor] : []),
	...(managedQueuePoolAutorun('sandbox-browser') ? [SandboxBrowserManagedQueueProcessor] : [])
]

@Global()
@Module({
	imports: [
		RedisModule,
		DiscoveryModule,
		BullModule.forRootAsync({
			imports: [RedisModule],
			inject: [REDIS_OPTIONS],
			useFactory: async (options: RedisOptions) => ({
				connection: {
					...options,
					maxRetriesPerRequest: null
				}
			})
		}),
		BullModule.registerQueue({
			name: MANAGED_QUEUE_PHYSICAL_QUEUE_NAME,
			prefix: MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX,
			defaultJobOptions: {
				removeOnComplete: {
					age: 24 * 60 * 60,
					count: 5000
				},
				removeOnFail: {
					age: 7 * 24 * 60 * 60,
					count: 5000
				}
			}
		}),
		BullModule.registerQueue({
			name: MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME,
			prefix: MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX,
			defaultJobOptions: {
				removeOnComplete: { age: 24 * 60 * 60, count: 5000 },
				removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
			}
		})
	],
	providers: [
		ManagedQueueHandlerRegistryService,
		ManagedQueueHandlerExplorerService,
		ManagedQueueService,
		...MANAGED_QUEUE_PROCESSOR_PROVIDERS,
		{
			provide: MANAGED_QUEUE_SERVICE_TOKEN,
			useExisting: ManagedQueueService
		},
		{
			provide: MANAGED_QUEUE_HANDLER_REGISTRY_TOKEN,
			useExisting: ManagedQueueHandlerRegistryService
		}
	],
	exports: [
		ManagedQueueHandlerRegistryService,
		ManagedQueueHandlerExplorerService,
		ManagedQueueService,
		MANAGED_QUEUE_SERVICE_TOKEN,
		MANAGED_QUEUE_HANDLER_REGISTRY_TOKEN
	]
})
export class ManagedQueueModule {}
