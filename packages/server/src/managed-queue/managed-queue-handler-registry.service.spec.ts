import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'

describe('ManagedQueueHandlerRegistryService', () => {
	const context = {
		pluginName: 'plugin-a',
		queueName: 'queue-a',
		jobName: 'job-a',
		tenantId: 'tenant-1'
	}

	it('resolves scoped handlers before global handlers', async () => {
		const registry = new ManagedQueueHandlerRegistryService()
		const globalHandler = jest.fn()
		const scopedHandler = jest.fn()

		registry.register({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a',
			handler: globalHandler
		})
		registry.register({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a',
			scopeKey: 'org-1',
			handler: scopedHandler
		})

		expect(
			registry.resolve({
				pluginName: 'plugin-a',
				queueName: 'queue-a',
				jobName: 'job-a',
				scopeKey: 'org-1'
			})
		).toBe(scopedHandler)
		expect(
			registry.resolve({
				pluginName: 'plugin-a',
				queueName: 'queue-a',
				jobName: 'job-a',
				scopeKey: 'org-2'
			})
		).toBe(globalHandler)
	})

	it('unregisters only the matching handler instance', () => {
		const registry = new ManagedQueueHandlerRegistryService()
		const first = jest.fn()
		const second = jest.fn()
		const unregisterFirst = registry.register({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a',
			handler: first
		})
		registry.register({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a',
			handler: second
		})

		unregisterFirst()

		expect(
			registry.resolve({
				pluginName: 'plugin-a',
				queueName: 'queue-a',
				jobName: 'job-a'
			})
		).toBe(second)
	})

	it('limits local concurrency for a logical handler registration', async () => {
		const registry = new ManagedQueueHandlerRegistryService()
		let releaseFirst: (() => void) | undefined
		const starts: string[] = []
		const handler = jest.fn(async (job: { id?: string }) => {
			starts.push(job.id ?? '')
			if (job.id === 'job-1') {
				await new Promise<void>((resolve) => {
					releaseFirst = resolve
				})
			}
		})

		registry.register({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a',
			concurrency: 1,
			handler: handler as any
		})
		const registered = registry.resolve({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a'
		})

		const first = registered?.({ id: 'job-1', name: 'job-a', data: {}, attemptsMade: 0 }, context)
		await Promise.resolve()
		const second = registered?.({ id: 'job-2', name: 'job-a', data: {}, attemptsMade: 0 }, context)
		await Promise.resolve()

		expect(starts).toEqual(['job-1'])

		releaseFirst?.()
		await Promise.all([first, second])

		expect(starts).toEqual(['job-1', 'job-2'])
		expect(handler).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'job-1' }), context)
		expect(handler).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'job-2' }), context)
	})
})
