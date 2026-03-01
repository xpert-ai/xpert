import { Logger } from '@nestjs/common'
import { XpertPublishTriggersCommand } from '../commands'
import { XpertTriggerBootstrapRecoveryService } from './trigger-bootstrap-recovery.service'

jest.mock('../xpert.entity', () => ({
	Xpert: class MockXpert {}
}))

describe('XpertTriggerBootstrapRecoveryService', () => {
	let logSpy: jest.SpyInstance
	let warnSpy: jest.SpyInstance
	let errorSpy: jest.SpyInstance

	beforeEach(() => {
		logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
		warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
		errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	function createService(params?: {
		xperts?: any[]
		getProvider?: (provider: string) => any
		lockId?: string | null
		commandError?: Error | null
	}) {
		const repository = {
			find: jest
				.fn()
				.mockResolvedValueOnce(params?.xperts ?? [])
				.mockResolvedValueOnce([])
		}
		const commandBus = {
			execute: params?.commandError
				? jest.fn().mockRejectedValue(params.commandError)
				: jest.fn().mockResolvedValue(undefined)
		}
		const triggerRegistry = {
			get: jest.fn((provider: string) => params?.getProvider?.(provider))
		}
		const redisLockService = {
			acquireLock: jest.fn().mockResolvedValue(params?.lockId ?? 'lock-id'),
			releaseLock: jest.fn().mockResolvedValue(true)
		}

		const service = new XpertTriggerBootstrapRecoveryService(
			repository as any,
			commandBus as any,
			triggerRegistry as any,
			redisLockService as any
		)

		return {
			service,
			repository,
			commandBus,
			triggerRegistry,
			redisLockService
		}
	}

	it('replays only providers marked as replay_publish', async () => {
		const xpert = {
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
		}

		const { service, commandBus, redisLockService } = createService({
			xperts: [xpert],
			getProvider: (provider) => {
				if (provider === 'schedule') {
					return {
						bootstrap: {
							mode: 'replay_publish',
							critical: false
						}
					}
				}
				if (provider === 'lark') {
					return {
						bootstrap: {
							mode: 'skip',
							critical: false
						}
					}
				}
				throw new Error(`Unexpected provider ${provider}`)
			}
		})

		await service.onApplicationBootstrap()

		expect(commandBus.execute).toHaveBeenCalledTimes(1)
		const [command] = commandBus.execute.mock.calls[0]
		expect(command).toBeInstanceOf(XpertPublishTriggersCommand)
		expect(command.options).toEqual(
			expect.objectContaining({
				strict: false,
				providers: ['schedule']
			})
		)
		expect(redisLockService.releaseLock).toHaveBeenCalledWith('job:trigger:xpert-1', 'lock-id')
	})

	it('fails open when provider is missing and records failure summary', async () => {
		const { service, commandBus } = createService({
			xperts: [
				{
					id: 'xpert-1',
					graph: {
						nodes: [
							{
								type: 'workflow',
								entity: {
									type: 'trigger',
									from: 'unknown',
									config: {}
								}
							}
						]
					}
				}
			],
			getProvider: () => {
				throw new Error('provider-not-found')
			}
		})

		await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()

		expect(commandBus.execute).not.toHaveBeenCalled()
		expect(
			warnSpy.mock.calls.some(
				([message]) =>
					typeof message === 'string' &&
					message.includes('"phase":"bootstrap_recovery"') &&
					message.includes('"provider":"unknown"') &&
					message.includes('"result":"failed"')
			)
		).toBe(true)
		expect(
			logSpy.mock.calls.some(
				([message]) =>
					typeof message === 'string' &&
					message.includes('"phase":"bootstrap_recovery_summary"') &&
					message.includes('"failed":1')
			)
		).toBe(true)
	})

	it('releases redis lock in finally when replay command fails', async () => {
		const { service, redisLockService } = createService({
			xperts: [
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
							}
						]
					}
				}
			],
			getProvider: () => ({
				bootstrap: {
					mode: 'replay_publish',
					critical: false
				}
			}),
			commandError: new Error('publish failed')
		})

		await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()

		expect(redisLockService.releaseLock).toHaveBeenCalledWith('job:trigger:xpert-1', 'lock-id')
		expect(
			errorSpy.mock.calls.some(
				([message]) =>
					typeof message === 'string' &&
					message.includes('"phase":"bootstrap_recovery"') &&
					message.includes('"result":"failed"') &&
					message.includes('publish failed')
			)
		).toBe(true)
	})
})
