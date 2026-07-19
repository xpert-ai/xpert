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

jest.mock('../user/user.service', () => ({
	UserService: class UserService {}
}))

describe('ManagedQueueProcessor', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

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
		const userService = {
			findOneByIdWithinTenant: jest.fn().mockResolvedValue({
				id: 'business-user-1',
				tenantId: 'tenant-1',
				role: { name: 'VIEWER' }
			})
		}
		const processor = new ManagedQueueProcessor(registry, userService as never)
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
				actor: {
					userId: 'business-user-1',
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					type: 'delegated_user'
				},
				delegation: {
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					principalType: 'api_key',
					ownerUserId: 'owner-user-1',
					apiKeyUserId: 'assistant-user-1',
					requestedUserId: 'business-user-1',
					apiKey: {
						type: 'assistant',
						entityId: 'xpert-1',
						tenantId: 'tenant-1',
						organizationId: 'org-1',
						userId: 'assistant-user-1'
					}
				},
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
				user: expect.objectContaining({
					id: 'business-user-1',
					tenantId: 'tenant-1',
					ownerUserId: 'owner-user-1',
					requestedUserId: 'business-user-1',
					apiKey: expect.objectContaining({
						token: '[managed-queue-delegation]',
						type: 'assistant',
						entityId: 'xpert-1'
					})
				}),
				headers: expect.objectContaining({
					'tenant-id': 'tenant-1',
					'organization-id': 'org-1',
					'x-scope-level': 'organization'
				})
			}),
			expect.anything(),
			expect.any(Function)
		)
		expect(userService.findOneByIdWithinTenant).toHaveBeenCalledWith('business-user-1', 'tenant-1', {
			relations: ['role', 'role.rolePermissions', 'employee']
		})
		expect(runWithLegacyRequestContext).toHaveBeenCalled()
		expect(handler).toHaveBeenCalledWith(
			{
				id: 'job-1',
				name: 'job-a',
				data: { hello: 'world' },
				attemptsMade: 1,
				opts: { attempts: 3 }
			},
			{
				pluginName: 'plugin-a',
				queueName: 'queue-a',
				jobName: 'job-a',
				scopeKey: 'org-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'business-user-1'
			}
		)
	})

	it('restores a logged-in actor without attaching an xpert API principal', async () => {
		const handler = jest.fn(async () => undefined)
		const registry = {
			resolve: jest.fn(() => handler)
		} as unknown as ManagedQueueHandlerRegistryService
		const userService = {
			findOneByIdWithinTenant: jest.fn().mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' })
		}
		const processor = new ManagedQueueProcessor(registry, userService as never)

		await processor.process({
			id: 'job-user-1',
			attemptsMade: 0,
			opts: {},
			data: {
				pluginName: 'plugin-cut',
				queueName: 'analysis',
				jobName: 'transcribe',
				payload: {},
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				actor: {
					userId: 'user-1',
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					type: 'user'
				},
				enqueuedAt: new Date().toISOString()
			}
		} as never)

		const request = jest.mocked(runWithRequestContext).mock.calls[0]?.[0]
		expect(request.user).toMatchObject({ id: 'user-1', tenantId: 'tenant-1' })
		expect(request.user).not.toHaveProperty('apiKey')
		expect(handler).toHaveBeenCalledTimes(1)
	})

	it('throws when no handler is registered so BullMQ can retry', async () => {
		const processor = new ManagedQueueProcessor(
			{
				resolve: jest.fn(() => null)
			} as unknown as ManagedQueueHandlerRegistryService,
			{
				findOneByIdWithinTenant: jest.fn()
			} as never
		)

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
