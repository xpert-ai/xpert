import { ConnectionCommandRouterService } from './connection-command-router.service'
import { InstanceRegistryService } from './instance-registry.service'
import { ManagedConnectionRegistryService } from './managed-connection-registry.service'

describe('ConnectionCommandRouterService', () => {
	it('dispatches directly when the owner is the current instance', async () => {
		const registry = {
			getOwner: jest.fn(async () => 'pod-a')
		}
		const service = new ConnectionCommandRouterService(
			{} as any,
			{ instanceId: 'pod-a' } as InstanceRegistryService,
			registry as unknown as ManagedConnectionRegistryService
		)
		const handler = jest.fn(async (request) => ({
			command: request.command,
			payload: request.payload
		}))

		service.registerHandler('wechat_tunnel', handler)

		await expect(
			service.invokeOwner(
				'wechat_tunnel',
				'client-1',
				'disconnect',
				{ reason: 'admin' },
				{
					pluginName: '@xpert-ai/plugin-community-wechat'
				}
			)
		).resolves.toEqual({
			command: 'disconnect',
			payload: { reason: 'admin' }
		})
		expect(registry.getOwner).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-community-wechat',
			connectionType: 'wechat_tunnel',
			connectionKey: 'client-1',
			tenantId: undefined,
			organizationId: undefined
		})
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				connectionType: 'wechat_tunnel',
				connectionKey: 'client-1',
				command: 'disconnect',
				payload: { reason: 'admin' }
			})
		)
	})

	it('fails clearly when no active owner exists', async () => {
		const service = new ConnectionCommandRouterService(
			{} as any,
			{ instanceId: 'pod-a' } as InstanceRegistryService,
			{ getOwner: jest.fn(async () => null) } as unknown as ManagedConnectionRegistryService
		)

		await expect(service.invokeOwner('wechat_tunnel', 'client-1', 'disconnect')).rejects.toThrow(
			'Managed connection owner not found'
		)
	})
})
