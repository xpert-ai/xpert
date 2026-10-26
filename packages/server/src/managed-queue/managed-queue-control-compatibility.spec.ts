import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'

describe('controlled queue handler compatibility', () => {
	it('does not resolve a legacy handler for a required control contract', () => {
		const registry = new ManagedQueueHandlerRegistryService()
		const identity = { pluginName: 'test-tools', queueName: 'tasks', jobName: 'execute' }
		registry.register({ ...identity, handler: jest.fn() })
		const required = { ...identity, controlContract: 'test-tools/execution-v1' }
		expect(registry.resolve(required)).toBeNull()
	})

	it('requires an exact explicit contract and does not fall back around a scoped incompatible handler', () => {
		const registry = new ManagedQueueHandlerRegistryService()
		const identity = { pluginName: 'test-tools', queueName: 'tasks', jobName: 'execute' }
		registry.register({ ...identity, controlContract: 'control/v1', handler: jest.fn() })
		registry.register({ ...identity, scopeKey: 'org', handler: jest.fn() })
		expect(registry.resolve({ ...identity, controlContract: 'control/v1' })).toEqual(expect.any(Function))
		expect(registry.resolve({ ...identity, controlContract: 'control/v2' })).toBeNull()
		expect(registry.resolve({ ...identity, scopeKey: 'org', controlContract: 'control/v1' })).toBeNull()
	})

	it('does not invoke a withdrawn registration after waiting for local concurrency', async () => {
		const registry = new ManagedQueueHandlerRegistryService()
		const identity = { pluginName: 'test', queueName: 'work', jobName: 'run', controlContract: 'v1' }
		let release!: () => void
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		const body = jest.fn(async () => {
			await gate
		})
		const unregister = registry.register({ ...identity, concurrency: 1, handler: body })
		const handler = registry.resolve(identity)
		const context = {
			...identity,
			control: {
				reference: { version: 2 as const, targetId: 'task' },
				signal: new AbortController().signal,
				desired: async () => 'running' as const
			}
		}
		const job = { name: 'run', data: {}, attemptsMade: 0, updateData: async () => undefined }
		const first = handler(job, context)
		const second = Promise.resolve(handler(job, context))
		const rejected = expect(second).rejects.toMatchObject({ response: { reason: 'handler' } })
		await Promise.resolve()
		await Promise.resolve()
		registry.register({ ...identity, controlContract: 'v2', handler: body })
		unregister()
		expect(registry.resolve({ ...identity, controlContract: 'v2' })).not.toBeNull()
		release()
		await first
		await rejected
		expect(body).toHaveBeenCalledTimes(1)
	})
})
