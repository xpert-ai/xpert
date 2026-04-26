import { XPERT_EVENT_TYPES } from '@xpert-ai/contracts'
import { XpertEventStreamService } from './event-stream.service'

describe('XpertEventStreamService', () => {
	it('appends events to the tenant stream', async () => {
		const redis = {
			sendCommand: jest.fn().mockResolvedValue('1-0'),
			expire: jest.fn()
		}
		const service = new XpertEventStreamService(redis as unknown as ConstructorParameters<typeof XpertEventStreamService>[0])

		const record = await service.appendEvent('tenant-1', {
			id: 'event-1',
			type: XPERT_EVENT_TYPES.ChatEvent,
			version: 1,
			scope: {},
			source: {
				type: 'chat',
				id: 'chat'
			},
			payload: {},
			timestamp: 1
		})

		expect(redis.sendCommand).toHaveBeenCalledWith([
			'XADD',
			'xpert:event:tenant-1',
			'MAXLEN',
			'~',
			expect.any(String),
			'*',
			'data',
			expect.any(String)
		])
		expect(record?.streamId).toBe('1-0')
	})

	it('replays and filters stream records', async () => {
		const redis = {
			sendCommand: jest.fn()
		}
		const readClient = {
			connect: jest.fn(),
			quit: jest.fn(),
			sendCommand: jest.fn().mockResolvedValue([
				[
					'1-0',
					[
						'data',
						JSON.stringify({
							id: 'event-1',
							type: XPERT_EVENT_TYPES.ProjectTaskExecutionSucceeded,
							version: 1,
							scope: {
								projectId: 'project-1'
							},
							source: {
								type: 'project',
								id: 'execution-1'
							},
							payload: {},
							timestamp: 1
						})
					]
				]
			])
		}
		const service = new XpertEventStreamService({
			...redis,
			duplicate: () => readClient
		} as unknown as ConstructorParameters<typeof XpertEventStreamService>[0])
		await service.onModuleInit()

		const records = await service.replay({
			tenantId: 'tenant-1',
			filter: {
				projectId: 'project-1'
			},
			lastEventId: '0-0',
			limit: 10
		})

		expect(readClient.sendCommand).toHaveBeenCalledWith([
			'XRANGE',
			'xpert:event:tenant-1',
			'(0-0',
			'+',
			'COUNT',
			'10'
		])
		expect(records).toHaveLength(1)
		expect(records[0].streamId).toBe('1-0')
	})

	it('advances the live stream cursor over filtered records', async () => {
		let releaseSecondRead: ((value: unknown) => void) | null = null
		const readClient = {
			connect: jest.fn(),
			quit: jest.fn(),
			sendCommand: jest.fn((command: string[]) => {
				if (command[0] !== 'XREAD') {
					return Promise.resolve([])
				}
				if (readClient.sendCommand.mock.calls.length === 1) {
					return Promise.resolve([
						[
							'xpert:event:tenant-1',
							[
								[
									'1-0',
									[
										'data',
										JSON.stringify({
											id: 'event-1',
											type: XPERT_EVENT_TYPES.ProjectTaskExecutionSucceeded,
											version: 1,
											scope: {
												projectId: 'other-project'
											},
											source: {
												type: 'project',
												id: 'execution-1'
											},
											payload: {},
											timestamp: 1
										})
									]
								]
							]
						]
					])
				}
				return new Promise((resolve) => {
					releaseSecondRead = resolve
				})
			})
		}
		const service = new XpertEventStreamService({
			duplicate: () => readClient
		} as unknown as ConstructorParameters<typeof XpertEventStreamService>[0])
		await service.onModuleInit()

		const subscription = service
			.createEventStream({
				tenantId: 'tenant-1',
				filter: {
					projectId: 'project-1'
				}
			})
			.subscribe()

		await waitForCondition(() => readClient.sendCommand.mock.calls.length >= 2)
		expect(readClient.sendCommand.mock.calls[1][0]).toEqual([
			'XREAD',
			'COUNT',
			expect.any(String),
			'BLOCK',
			expect.any(String),
			'STREAMS',
			'xpert:event:tenant-1',
			'1-0'
		])

		subscription.unsubscribe()
		releaseSecondRead?.([])
		await service.onModuleDestroy()
	})
})

async function waitForCondition(predicate: () => boolean) {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (predicate()) {
			return
		}
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
	throw new Error('Timed out waiting for condition')
}
