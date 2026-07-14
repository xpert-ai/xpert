jest.mock('@xpert-ai/plugin-sdk', () => ({
	runWithRequestContext: jest.fn((req, _res, next) => next()),
	RequestContext: {
		currentTenantId: jest.fn(() => null),
		getOrganizationId: jest.fn(() => null)
	}
}))

import { runWithRequestContext } from '@xpert-ai/plugin-sdk'
import { runWithRequestContext as runWithLegacyRequestContext } from '../core/context/request-context.middleware'
import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'
import { ManagedQueueProcessor, managedQueuePoolAutorun } from './managed-queue.processor'

jest.mock('../core/context/request-context.middleware', () => ({
	runWithRequestContext: jest.fn((_req, next) => next())
}))

describe('ManagedQueueProcessor', () => {
	it('starts both logical queue pools in the API process by default', () => {
		expect(managedQueuePoolAutorun('default', { NODE_ENV: 'development' })).toBe(true)
		expect(managedQueuePoolAutorun('sandbox-browser', { NODE_ENV: 'development' })).toBe(true)
		expect(managedQueuePoolAutorun('sandbox-browser', { NODE_ENV: 'test' })).toBe(true)
		expect(managedQueuePoolAutorun('default', { NODE_ENV: 'production' })).toBe(true)
		expect(managedQueuePoolAutorun('sandbox-browser', { NODE_ENV: 'production' })).toBe(true)
	})

	it('keeps the global autorun override for maintenance', () => {
		expect(managedQueuePoolAutorun('default', { MANAGED_QUEUE_AUTORUN: 'false' })).toBe(false)
		expect(managedQueuePoolAutorun('sandbox-browser', { MANAGED_QUEUE_AUTORUN: 'false' })).toBe(false)
	})

	it('restores tenant context and dispatches plugin payload to the registered handler', async () => {
		const handler = jest.fn(async () => undefined)
		const registry = {
			resolve: jest.fn(() => handler)
		} as unknown as ManagedQueueHandlerRegistryService
		const processor = new ManagedQueueProcessor(registry)
		const job = {
			id: 'job-1',
			attemptsMade: 1,
			opts: { attempts: 3 },
			data: {
				pluginName: 'plugin-a',
				queueName: 'queue-a',
				jobName: 'job-a',
				payload: { hello: 'world' },
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				scopeKey: 'org-1',
				enqueuedAt: new Date().toISOString()
			}
		}

		await processor.process(job as any)

		expect(registry.resolve).toHaveBeenCalledWith({
			pluginName: 'plugin-a',
			queueName: 'queue-a',
			jobName: 'job-a',
			scopeKey: 'org-1'
		})
		expect(runWithRequestContext).toHaveBeenCalledWith(
			expect.objectContaining({
				user: expect.objectContaining({ tenantId: 'tenant-1' }),
				headers: expect.objectContaining({
					'tenant-id': 'tenant-1',
					'organization-id': 'org-1',
					'x-scope-level': 'organization'
				})
			}),
			expect.anything(),
			expect.any(Function)
		)
		expect(runWithLegacyRequestContext).toHaveBeenCalled()
		expect(handler).toHaveBeenCalledWith({
			id: 'job-1',
			name: 'job-a',
			data: { hello: 'world' },
			attemptsMade: 1,
			opts: { attempts: 3 }
		})
	})

	it('throws when no handler is registered so BullMQ can retry', async () => {
		const processor = new ManagedQueueProcessor({
			resolve: jest.fn(() => null)
		} as unknown as ManagedQueueHandlerRegistryService)

		await expect(
			processor.process({
				id: 'job-1',
				attemptsMade: 0,
				opts: {},
				data: {
					pluginName: 'plugin-a',
					queueName: 'queue-a',
					jobName: 'job-a',
					payload: {},
					enqueuedAt: new Date().toISOString()
				}
			} as any)
		).rejects.toThrow('No managed queue handler registered')
	})
})
