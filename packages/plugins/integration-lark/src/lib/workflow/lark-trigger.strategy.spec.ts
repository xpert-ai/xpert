import { INTEGRATION_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import { LarkTriggerStrategy } from './lark-trigger.strategy'

describe('LarkTriggerStrategy', () => {
	function createStrategy(params?: {
		dbBindings?: Array<[string, string]>
	}) {
		const persistedBindings = new Map<string, string>(params?.dbBindings ?? [])
		const dispatchService = {
			buildDispatchMessage: jest.fn().mockResolvedValue({
				id: 'handoff-id'
			}),
			enqueueDispatch: jest.fn().mockResolvedValue({
				messageId: 'enqueued-message'
			})
		}
		const integrationPermissionService = {
			read: jest.fn().mockResolvedValue({
				id: 'integration-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				createdById: 'user-1',
				updatedById: 'user-1'
			})
		}
		const bindingRepository = {
			findOne: jest.fn().mockImplementation(async ({ where }: { where: { integrationId: string } }) => {
				const xpertId = persistedBindings.get(where.integrationId)
				if (!xpertId) {
					return null
				}
				return {
					integrationId: where.integrationId,
					xpertId
				}
			}),
			find: jest.fn().mockImplementation(async ({ where }: { where: { xpertId: string } }) => {
				const rows: Array<{ integrationId: string; xpertId: string }> = []
				for (const [integrationId, xpertId] of persistedBindings.entries()) {
					if (xpertId === where.xpertId) {
						rows.push({
							integrationId,
							xpertId
						})
					}
				}
				return rows
			}),
			upsert: jest
				.fn()
				.mockImplementation(async ({ integrationId, xpertId }: { integrationId: string; xpertId: string }) => {
					persistedBindings.set(integrationId, xpertId)
					return { generatedMaps: [], raw: [], identifiers: [] }
				}),
			delete: jest.fn().mockImplementation(async (criteria: { integrationId?: string; xpertId?: string }) => {
				if (criteria.integrationId) {
					const current = persistedBindings.get(criteria.integrationId)
					if (!criteria.xpertId || current === criteria.xpertId) {
						persistedBindings.delete(criteria.integrationId)
					}
				} else if (criteria.xpertId) {
					for (const [integrationId, xpertId] of persistedBindings) {
						if (xpertId === criteria.xpertId) {
							persistedBindings.delete(integrationId)
						}
					}
				}
				return { affected: 1 }
			})
		}
		const pluginContext = {
			resolve: jest.fn((token: unknown) => {
				if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
					return integrationPermissionService
				}
				throw new Error(`Unexpected token: ${String(token)}`)
			})
		}

		const strategy = new LarkTriggerStrategy(
			dispatchService as any,
			bindingRepository as any,
			pluginContext as any
		)
		return {
			strategy,
			dispatchService,
			bindingRepository,
			persistedBindings
		}
	}

	it('publishes binding and forwards inbound messages via callback', async () => {
		const { strategy, dispatchService, bindingRepository, persistedBindings } = createStrategy()
		const callback = jest.fn()

		await strategy.publish(
			{
				xpertId: 'xpert-1',
				config: {
					enabled: true,
					integrationId: 'integration-1'
				}
			} as any,
			callback
		)

		const handled = await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: 'hello',
			larkMessage: {} as any
		})

		expect(handled).toBe(true)
		expect(dispatchService.buildDispatchMessage).toHaveBeenCalledTimes(1)
		expect(bindingRepository.upsert).toHaveBeenCalledTimes(1)
		expect(persistedBindings.get('integration-1')).toBe('xpert-1')
		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({
				from: 'lark',
				xpertId: 'xpert-1',
				handoffMessage: expect.objectContaining({ id: 'handoff-id' })
			})
		)
	})

	it('throws when one integration is bound to different xperts', async () => {
		const { strategy } = createStrategy({
			dbBindings: [['integration-1', 'xpert-1']]
		})

		await expect(
			strategy.publish(
				{
					xpertId: 'xpert-2',
					config: {
						enabled: true,
						integrationId: 'integration-1'
					}
				} as any,
				jest.fn()
			)
		).rejects.toThrow(/already bound/)
	})

	it('reports validation error when integration binding conflicts', async () => {
		const { strategy } = createStrategy({
			dbBindings: [['integration-1', 'xpert-1']]
		})

		const checklist = await strategy.validate({
			xpertId: 'xpert-2',
			node: { key: 'trigger-1' },
			config: {
				enabled: true,
				integrationId: 'integration-1'
			}
		} as any)

		expect(checklist).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ruleCode: 'TRIGGER_LARK_INTEGRATION_CONFLICT',
					field: 'integrationId',
					level: 'error'
				})
			])
		)
	})

	it('resolves bound xpert id from persisted binding table', async () => {
		const { strategy, bindingRepository } = createStrategy({
			dbBindings: [['integration-1', 'xpert-from-db']]
		})

		const xpertId = await strategy.getBoundXpertId('integration-1')

		expect(xpertId).toBe('xpert-from-db')
		expect(bindingRepository.findOne).toHaveBeenCalledTimes(1)
	})

	it('handles inbound message by persisted binding when runtime callback is missing', async () => {
		const { strategy, dispatchService } = createStrategy({
			dbBindings: [['integration-1', 'xpert-from-db']]
		})

		const handled = await strategy.handleInboundMessage({
			integrationId: 'integration-1',
			input: 'hello',
			larkMessage: {} as any
		})

		expect(handled).toBe(true)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				xpertId: 'xpert-from-db',
				input: 'hello'
			})
		)
		expect(dispatchService.buildDispatchMessage).not.toHaveBeenCalled()
	})
})
