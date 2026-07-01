jest.mock('@xpert-ai/plugin-sdk', () => {
	const { Subject } = require('rxjs')
	const PLUGIN_JOB_PROCESSOR_METADATA = 'XPERT_PLUGIN_JOB_PROCESSOR_METADATA'
	return {
		ORGANIZATION_METADATA_KEY: 'xpert:organizationId',
		PLUGIN_JOB_PROCESSOR_METADATA,
		PluginJobProcessor: (options: any) => (target: any) => {
			const metadata = {
				pluginName: options.pluginName,
				queueName: options.queueName ?? options.queue,
				jobName: options.jobName ?? options.jobType,
				...(options.concurrency === undefined ? {} : { concurrency: options.concurrency })
			}
			const existing = Reflect.getMetadata(PLUGIN_JOB_PROCESSOR_METADATA, target) ?? []
			Reflect.defineMetadata(PLUGIN_JOB_PROCESSOR_METADATA, [metadata, ...existing], target)
		},
		StrategyBus: class StrategyBus {
			private readonly subject = new Subject()
			readonly events$ = this.subject.asObservable()
			upsert(strategyType: string, entry: any) {
				this.subject.next({ type: 'UPSERT', strategyType, entry })
			}
			remove(orgId: string, pluginName: string) {
				this.subject.next({ type: 'REMOVE', orgId, pluginName })
			}
		}
	}
})

import {
	ORGANIZATION_METADATA_KEY,
	PLUGIN_JOB_PROCESSOR_METADATA,
	PluginJobProcessor,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { ManagedQueueHandlerExplorerService } from './managed-queue-handler-explorer.service'

describe('ManagedQueueHandlerExplorerService', () => {
	function createReflector() {
		return {
			get: jest.fn((key: string, target: any) => Reflect.getMetadata(key, target))
		}
	}

	it('registers decorated providers with the managed queue registry', async () => {
		@PluginJobProcessor({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a',
			concurrency: 1
		})
		class TestProcessor {
			scopeKey = 'org-1'
			handle = jest.fn(async () => undefined)
		}

		const processor = new TestProcessor()
		const unregister = jest.fn()
		const registry = {
			register: jest.fn((_registration: any) => unregister)
		}
		const explorer = new ManagedQueueHandlerExplorerService(
			{
				getProviders: jest.fn(() => [{ id: 'processor-1', instance: processor, metatype: TestProcessor }])
			} as any,
			createReflector() as any,
			registry as any,
			new StrategyBus()
		)

		explorer.onModuleInit()

		expect(Reflect.getMetadata(PLUGIN_JOB_PROCESSOR_METADATA, TestProcessor)).toHaveLength(1)
		expect(registry.register).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: 'plugin-a',
				queueName: 'queue-a',
				jobName: 'job-a',
				scopeKey: 'org-1',
				concurrency: 1,
				handler: expect.any(Function)
			})
		)

		const registration = registry.register.mock.calls[0][0]
		const job = { id: 'job-1', name: 'job-a', data: { ok: true }, attemptsMade: 0 }
		await registration.handler(job)

		expect(processor.handle).toHaveBeenCalledWith(job, {
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a',
			scopeKey: 'org-1'
		})

		explorer.onModuleDestroy()

		expect(unregister).toHaveBeenCalledTimes(1)
	})

	it('updates dynamically loaded plugin handlers from the strategy bus', () => {
		@PluginJobProcessor({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-b'
		})
		class DynamicProcessor {
			process = jest.fn(async () => undefined)
		}
		Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-2', DynamicProcessor)

		const processor = new DynamicProcessor()
		const unregister = jest.fn()
		const registry = {
			register: jest.fn((_registration: any) => unregister)
		}
		const strategyBus = new StrategyBus()
		const explorer = new ManagedQueueHandlerExplorerService(
			{
				getProviders: jest.fn(() => [])
			} as any,
			createReflector() as any,
			registry as any,
			strategyBus
		)

		explorer.onModuleInit()
		strategyBus.upsert(PLUGIN_JOB_PROCESSOR_METADATA, {
			instance: processor,
			sourceId: 'org-2:plugin-a:DynamicProcessor',
			sourceKind: 'plugin'
		})

		expect(registry.register).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: 'plugin-a',
				queueName: 'queue-a',
				jobName: 'job-b',
				scopeKey: 'org-2',
				handler: expect.any(Function)
			})
		)

		strategyBus.remove('org-2', 'plugin-a')

		expect(unregister).toHaveBeenCalledTimes(1)
	})
})
