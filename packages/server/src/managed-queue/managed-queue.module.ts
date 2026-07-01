import { BullModule } from '@nestjs/bullmq'
import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { MANAGED_QUEUE_HANDLER_REGISTRY_TOKEN, MANAGED_QUEUE_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import type { RedisOptions } from 'ioredis'
import { RedisModule } from '../core/redis'
import { REDIS_OPTIONS } from '../core/redis/types'
import { MANAGED_QUEUE_PHYSICAL_QUEUE_NAME, MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX } from './constants'
import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'
import { ManagedQueueHandlerExplorerService } from './managed-queue-handler-explorer.service'
import { ManagedQueueProcessor } from './managed-queue.processor'
import { ManagedQueueService } from './managed-queue.service'

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
		})
	],
	providers: [
		ManagedQueueHandlerRegistryService,
		ManagedQueueHandlerExplorerService,
		ManagedQueueService,
		ManagedQueueProcessor,
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
