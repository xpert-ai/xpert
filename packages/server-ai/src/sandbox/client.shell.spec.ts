const mockEventSourceInstances: MockEventSource[] = []

class MockEventSource {
	url: string
	options: any
	listeners = new Map<string, Array<(event: any) => void>>()
	close = jest.fn()

	constructor(url: string, options: any) {
		this.url = url
		this.options = options
		mockEventSourceInstances.push(this)
	}

	addEventListener(type: string, listener: (event: any) => void) {
		const listeners = this.listeners.get(type) ?? []
		listeners.push(listener)
		this.listeners.set(type, listeners)
	}

	emit(type: string, event: any) {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event)
		}
	}
}

jest.mock('@langchain/core/callbacks/dispatch', () => ({
	dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@metad/contracts', () => ({
	ChatMessageEventTypeEnum: {
		ON_TOOL_MESSAGE: 'ON_TOOL_MESSAGE'
	},
	ChatMessageStepCategory: {
		Program: 'Program'
	}
}))

jest.mock('@metad/server-common', () => ({
	getPythonErrorMessage: (error: any) => error?.message ?? String(error),
	shortuuid: () => 'shortuuid',
	urlJoin: (...parts: string[]) => parts.join('/')
}))

jest.mock('@metad/server-config', () => ({
	environment: {
		pro: true
	}
}))

jest.mock('@metad/server-core', () => ({
	DeployWebappCommand: class DeployWebappCommand {},
	RequestContext: {
		currentTenantId: () => 'tenant-id'
	}
}))

jest.mock('@nestjs/cqrs', () => ({
	CommandBus: class CommandBus {}
}))

jest.mock('axios', () => ({
	__esModule: true,
	default: {
		post: jest.fn(),
		get: jest.fn()
	}
}))

jest.mock('eventsource', () => ({
	EventSource: jest.fn().mockImplementation((url: string, options: any) => new MockEventSource(url, options))
}))

jest.mock('i18next', () => ({
	t: (key: string) => key
}))

jest.mock('../shared', () => ({
	sandboxVolume: jest.fn(),
	sandboxVolumeUrl: jest.fn()
}))

import { ShellClient } from './client'

describe('ShellClient', () => {
	beforeEach(() => {
		mockEventSourceInstances.length = 0
		jest.clearAllMocks()
	})

	it('includes the timeout termination message in exec() rejections', async () => {
		const client = new ShellClient({
			commandBus: {} as any,
			sandboxUrl: 'http://sandbox'
		})

		const promise = client.exec(
			{
				workspace_id: 'workspace',
				command: 'npm install'
			},
			{
				signal: new AbortController().signal,
				toolCall: { id: 'tool-call-1' } as any
			}
		)

		const eventSource = mockEventSourceInstances[0]
		eventSource.emit('message', { data: 'line 1' })
		eventSource.emit('message', {
			data: '<timeout> <error> Command timed out after 1s (1000ms)'
		})

		await expect(promise).rejects.toBe('line 1\n<timeout> <error> Command timed out after 1s (1000ms)')
	})

	it('emits and propagates the timeout termination message in stream()', async () => {
		const client = new ShellClient({
			commandBus: {} as any,
			sandboxUrl: 'http://sandbox'
		})
		const nextValues: string[] = []

		const completion = new Promise<string>((resolve) => {
			client
				.stream({
					workspace_id: 'workspace',
					command: 'npm install'
				})
				.subscribe({
					next: (value) => nextValues.push(String(value)),
					error: (error) => resolve(String(error))
				})

			const eventSource = mockEventSourceInstances[0]
			eventSource.emit('message', { data: 'line 1' })
			eventSource.emit('message', {
				data: '<timeout> <error> Command timed out after 1s (1000ms)'
			})
		})

		await expect(completion).resolves.toBe('line 1\n<timeout> <error> Command timed out after 1s (1000ms)')
		expect(nextValues).toEqual(['line 1', '<timeout> <error> Command timed out after 1s (1000ms)'])
	})
})
