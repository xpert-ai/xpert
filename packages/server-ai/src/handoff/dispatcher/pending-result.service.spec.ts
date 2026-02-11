import { HandoffPendingResultService } from './pending-result.service'

describe('HandoffPendingResultService', () => {
	let service: HandoffPendingResultService

	beforeEach(() => {
		service = new HandoffPendingResultService()
	})

	afterEach(() => {
		service.clearAll('test cleanup')
	})

	it('resolves a pending promise and cleans up map entry', async () => {
		const promise = service.waitFor<string>('msg-1', { timeoutMs: 1000 })
		expect(service.size()).toBe(1)

		expect(service.resolve('msg-1', 'done')).toBe(true)
		await expect(promise).resolves.toBe('done')
		expect(service.size()).toBe(0)
	})

	it('rejects a pending promise and cleans up map entry', async () => {
		const promise = service.waitFor<string>('msg-2', { timeoutMs: 1000 })
		expect(service.reject('msg-2', new Error('failed'))).toBe(true)

		await expect(promise).rejects.toThrow('failed')
		expect(service.size()).toBe(0)
	})

	it('times out pending promise when no result arrives', async () => {
		const promise = service.waitFor('msg-timeout', { timeoutMs: 20 })
		await expect(promise).rejects.toThrow('Pending result timeout')
		expect(service.size()).toBe(0)
	})

	it('publishes interim events to waiting callback', async () => {
		const events: unknown[] = []
		const promise = service.waitFor('msg-events', {
			timeoutMs: 1000,
			onEvent: (event) => events.push(event)
		})

		expect(service.publish('msg-events', { token: 'a' })).toBe(true)
		expect(service.publish('msg-events', { token: 'b' })).toBe(true)
		expect(events).toEqual([{ token: 'a' }, { token: 'b' }])

		service.resolve('msg-events', { status: 'ok' })
		await expect(promise).resolves.toEqual({ status: 'ok' })
	})

	it('rejects duplicate pending id registration', async () => {
		const first = service.waitFor('dup-id', { timeoutMs: 1000 })
		expect(() => service.waitFor('dup-id', { timeoutMs: 1000 })).toThrow(
			'Pending id already exists: dup-id'
		)
		service.resolve('dup-id', 'ok')
		await expect(first).resolves.toBe('ok')
	})
})
