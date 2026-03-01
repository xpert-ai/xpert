import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE } from '@xpert-ai/plugin-sdk'
import { STATE_VARIABLE_HUMAN } from '@metad/contracts'
import { XpertEnqueueTriggerDispatchCommand } from '../enqueue-trigger-dispatch.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'
import { XpertPublishTriggersHandler } from './publish-triggers.handler'

describe('XpertPublishTriggersHandler', () => {
	function createHandler() {
		const triggerRegistry = { get: jest.fn() }
		const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
		const handoffQueue = { enqueue: jest.fn().mockResolvedValue({ id: 'handoff-id' }) }

		const handler = new XpertPublishTriggersHandler(
			triggerRegistry as any,
			commandBus as any,
			handoffQueue as any
		)

		return {
			handler,
			triggerRegistry,
			commandBus,
			handoffQueue
		}
	}

	function triggerNode(from: string, config: Record<string, unknown>) {
		return {
			type: 'workflow',
			entity: {
				type: 'trigger',
				from,
				config
			}
		}
	}

	function graphWith(...triggers: Array<{ from: string; config: Record<string, unknown> }>) {
		return {
			nodes: triggers.map((trigger) => triggerNode(trigger.from, trigger.config)),
			connections: []
		}
	}

	it('publish callback adds trigger job', async () => {
		const { handler, triggerRegistry, commandBus } = createHandler()
		triggerRegistry.get.mockReturnValue({
			publish: jest.fn((_params, callback) => {
				callback({
					from: 'schedule',
					state: {
						[STATE_VARIABLE_HUMAN]: {
							input: 'trigger callback'
						}
					}
				})
			}),
			stop: jest.fn()
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: {
						nodes: [
							{
								type: 'workflow',
								entity: {
									type: 'trigger',
									from: 'lark',
									config: { enabled: true, integrationId: 'integration-1' }
								}
							}
						]
					}
				} as any,
				{
					strict: true
				}
			)
		)
		await new Promise((resolve) => setImmediate(resolve))

		expect(commandBus.execute).toHaveBeenCalledTimes(1)
		const [command] = commandBus.execute.mock.calls[0]
		expect(command).toBeInstanceOf(XpertEnqueueTriggerDispatchCommand)
		expect(command).toEqual(
			expect.objectContaining({
				xpertId: 'xpert-1',
				userId: null,
				state: expect.objectContaining({
					[STATE_VARIABLE_HUMAN]: {
						input: 'trigger callback'
					}
				}),
				params: expect.objectContaining({
					isDraft: false,
					from: 'schedule'
				})
			})
		)
	})

	it('publish callback enqueues handoffMessage directly', async () => {
		const { handler, triggerRegistry, handoffQueue } = createHandler()
		triggerRegistry.get.mockReturnValue({
			publish: jest.fn((_params, callback) => {
				callback({
					handoffMessage: {
						id: 'handoff-1',
						type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE
					}
				})
			}),
			stop: jest.fn()
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: {
						nodes: [
							{
								type: 'workflow',
								entity: {
									type: 'trigger',
									from: 'lark',
									config: { enabled: true, integrationId: 'integration-1' }
								}
							}
						]
					}
				} as any,
				{
					strict: true
				}
			)
		)
		await new Promise((resolve) => setImmediate(resolve))

		expect(handoffQueue.enqueue).toHaveBeenCalledTimes(1)
		expect(handoffQueue.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'handoff-1',
				type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE
			})
		)
	})

	it('throws when strict=true and provider.publish fails', async () => {
		const { handler, triggerRegistry } = createHandler()
		triggerRegistry.get.mockReturnValue({
			publish: jest.fn(() => {
				throw new Error('conflict')
			}),
			stop: jest.fn()
		})

		await expect(
			handler.execute(
				new XpertPublishTriggersCommand(
					{
						id: 'xpert-1',
						graph: {
							nodes: [
								{
									type: 'workflow',
									entity: {
										type: 'trigger',
										from: 'lark',
										config: { enabled: true, integrationId: 'integration-1' }
									}
								}
							]
						}
					} as any,
					{
						strict: true
					}
				)
			)
		).rejects.toThrow('conflict')
	})

	it('skips errors when strict=false', async () => {
		const { handler, triggerRegistry } = createHandler()
		triggerRegistry.get.mockImplementation(() => {
			throw new Error('provider-not-found')
		})

		await expect(
			handler.execute(
				new XpertPublishTriggersCommand(
					{
						id: 'xpert-1',
						graph: {
							nodes: [
								{
									type: 'workflow',
									entity: {
										type: 'trigger',
										from: 'lark',
										config: { enabled: true, integrationId: 'integration-1' }
									}
								}
							]
						}
					} as any,
					{
						strict: false
					}
				)
			)
		).resolves.toBeUndefined()
	})

	it('publishes only selected providers when options.providers is set', async () => {
		const { handler, triggerRegistry } = createHandler()
		const schedulePublish = jest.fn()
		const larkPublish = jest.fn()
		triggerRegistry.get.mockImplementation((provider: string) => {
			if (provider === 'schedule') {
				return {
					publish: schedulePublish,
					stop: jest.fn()
				}
			}
			if (provider === 'lark') {
				return {
					publish: larkPublish,
					stop: jest.fn()
				}
			}
			throw new Error(`Unexpected provider ${provider}`)
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: {
						nodes: [
							{
								type: 'workflow',
								entity: {
									type: 'trigger',
									from: 'schedule',
									config: { enabled: true, cron: '* * * * *', task: 'tick' }
								}
							},
							{
								type: 'workflow',
								entity: {
									type: 'trigger',
									from: 'lark',
									config: { enabled: true, integrationId: 'integration-1' }
								}
							}
						]
					}
				} as any,
				{
					strict: true,
					providers: ['schedule']
				}
			)
		)

		expect(schedulePublish).toHaveBeenCalledTimes(1)
		expect(larkPublish).not.toHaveBeenCalled()
		expect(triggerRegistry.get).toHaveBeenCalledTimes(1)
		expect(triggerRegistry.get).toHaveBeenCalledWith('schedule')
	})

	it('stops only selected providers from previousGraph when options.providers is set', async () => {
		const { handler, triggerRegistry } = createHandler()
		const scheduleStop = jest.fn()
		const larkStop = jest.fn()
		triggerRegistry.get.mockImplementation((provider: string) => {
			if (provider === 'schedule') {
				return {
					publish: jest.fn(),
					stop: scheduleStop
				}
			}
			if (provider === 'lark') {
				return {
					publish: jest.fn(),
					stop: larkStop
				}
			}
			throw new Error(`Unexpected provider ${provider}`)
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: {
						nodes: []
					}
				} as any,
				{
					strict: true,
					providers: ['schedule'],
					previousGraph: {
						nodes: [
							{
								type: 'workflow',
								entity: {
									type: 'trigger',
									from: 'schedule',
									config: { enabled: true, cron: '* * * * *', task: 'tick' }
								}
							},
							{
								type: 'workflow',
								entity: {
									type: 'trigger',
									from: 'lark',
									config: { enabled: true, integrationId: 'integration-1' }
								}
							}
						],
						connections: []
					} as any
				}
			)
		)

		expect(scheduleStop).toHaveBeenCalledTimes(1)
		expect(larkStop).not.toHaveBeenCalled()
		expect(triggerRegistry.get).toHaveBeenCalledTimes(1)
		expect(triggerRegistry.get).toHaveBeenCalledWith('schedule')
	})

	it('skips unchanged trigger when previousGraph has equivalent config', async () => {
		const { handler, triggerRegistry } = createHandler()
		const publish = jest.fn()
		const stop = jest.fn()
		triggerRegistry.get.mockReturnValue({
			publish,
			stop
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: graphWith({
						from: 'schedule',
						config: { b: 2, a: 1 }
					})
				} as any,
				{
					strict: true,
					previousGraph: graphWith({
						from: 'schedule',
						config: { a: 1, b: 2 }
					}) as any
				}
			)
		)

		expect(stop).not.toHaveBeenCalled()
		expect(publish).not.toHaveBeenCalled()
		expect(triggerRegistry.get).not.toHaveBeenCalled()
	})

	it('publishes added trigger only', async () => {
		const { handler, triggerRegistry } = createHandler()
		const publish = jest.fn()
		const stop = jest.fn()
		triggerRegistry.get.mockReturnValue({
			publish,
			stop
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: graphWith({
						from: 'schedule',
						config: { cron: '* * * * *', task: 'tick' }
					})
				} as any,
				{
					strict: true,
					previousGraph: graphWith() as any
				}
			)
		)

		expect(publish).toHaveBeenCalledTimes(1)
		expect(stop).not.toHaveBeenCalled()
	})

	it('stops removed trigger only', async () => {
		const { handler, triggerRegistry } = createHandler()
		const publish = jest.fn()
		const stop = jest.fn()
		triggerRegistry.get.mockReturnValue({
			publish,
			stop
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: graphWith()
				} as any,
				{
					strict: true,
					previousGraph: graphWith({
						from: 'schedule',
						config: { cron: '* * * * *', task: 'tick' }
					}) as any
				}
			)
		)

		expect(stop).toHaveBeenCalledTimes(1)
		expect(publish).not.toHaveBeenCalled()
	})

	it('reconciles changed trigger with stop then publish', async () => {
		const { handler, triggerRegistry } = createHandler()
		const calls: string[] = []
		const stop = jest.fn(({ config }) => {
			calls.push(`stop:${(config as any).version}`)
		})
		const publish = jest.fn(({ config }) => {
			calls.push(`publish:${(config as any).version}`)
		})
		triggerRegistry.get.mockReturnValue({
			publish,
			stop
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: graphWith({
						from: 'schedule',
						config: { version: 2 }
					})
				} as any,
				{
					strict: true,
					previousGraph: graphWith({
						from: 'schedule',
						config: { version: 1 }
					}) as any
				}
			)
		)

		expect(calls).toEqual(['stop:1', 'publish:2'])
	})

	it('attempts rollback and throws original error when changed publish fails in strict mode', async () => {
		const { handler, triggerRegistry } = createHandler()
		const stop = jest.fn()
		const publish = jest.fn(({ config }) => {
			if ((config as any).version === 2) {
				throw new Error('changed-publish-failed')
			}
		})
		triggerRegistry.get.mockReturnValue({
			publish,
			stop
		})

		await expect(
			handler.execute(
				new XpertPublishTriggersCommand(
					{
						id: 'xpert-1',
						graph: graphWith({
							from: 'schedule',
							config: { version: 2 }
						})
					} as any,
					{
						strict: true,
						previousGraph: graphWith({
							from: 'schedule',
							config: { version: 1 }
						}) as any
					}
				)
			)
		).rejects.toThrow('changed-publish-failed')

		expect(stop).toHaveBeenCalledTimes(1)
		expect(publish).toHaveBeenCalledTimes(2)
		expect(publish.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				config: expect.objectContaining({ version: 2 })
			})
		)
		expect(publish.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				config: expect.objectContaining({ version: 1 })
			})
		)
	})

	it('attempts rollback and continues when changed publish fails in non-strict mode', async () => {
		const { handler, triggerRegistry } = createHandler()
		const stop = jest.fn()
		const publish = jest.fn(({ config }) => {
			if ((config as any).version === 2) {
				throw new Error('changed-publish-failed')
			}
		})
		triggerRegistry.get.mockReturnValue({
			publish,
			stop
		})

		await expect(
			handler.execute(
				new XpertPublishTriggersCommand(
					{
						id: 'xpert-1',
						graph: graphWith({
							from: 'schedule',
							config: { version: 2 }
						})
					} as any,
					{
						strict: false,
						previousGraph: graphWith({
							from: 'schedule',
							config: { version: 1 }
						}) as any
					}
				)
			)
		).resolves.toBeUndefined()

		expect(stop).toHaveBeenCalledTimes(1)
		expect(publish).toHaveBeenCalledTimes(2)
	})

	it('applies provider filter to delta reconciliation', async () => {
		const { handler, triggerRegistry } = createHandler()
		const scheduleStop = jest.fn()
		const schedulePublish = jest.fn()
		const larkStop = jest.fn()
		const larkPublish = jest.fn()
		triggerRegistry.get.mockImplementation((provider: string) => {
			if (provider === 'schedule') {
				return {
					publish: schedulePublish,
					stop: scheduleStop
				}
			}
			if (provider === 'lark') {
				return {
					publish: larkPublish,
					stop: larkStop
				}
			}
			throw new Error(`Unexpected provider ${provider}`)
		})

		await handler.execute(
			new XpertPublishTriggersCommand(
				{
					id: 'xpert-1',
					graph: graphWith(
						{
							from: 'schedule',
							config: { version: 2 }
						},
						{
							from: 'lark',
							config: { version: 2 }
						}
					)
				} as any,
				{
					strict: true,
					providers: ['schedule'],
					previousGraph: graphWith(
						{
							from: 'schedule',
							config: { version: 1 }
						},
						{
							from: 'lark',
							config: { version: 1 }
						}
					) as any
				}
			)
		)

		expect(scheduleStop).toHaveBeenCalledTimes(1)
		expect(schedulePublish).toHaveBeenCalledTimes(1)
		expect(larkStop).not.toHaveBeenCalled()
		expect(larkPublish).not.toHaveBeenCalled()
		expect(triggerRegistry.get).toHaveBeenCalledTimes(1)
		expect(triggerRegistry.get).toHaveBeenCalledWith('schedule')
	})
})
