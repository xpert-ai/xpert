import { Observable, of } from 'rxjs'
import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE } from '@xpert-ai/plugin-sdk'
import {
	AgentChatDispatchHandoffProcessor
} from './agent-chat-dispatch.processor'
import { AgentChatCallbackNoopHandoffProcessor } from './agent-chat-callback-noop.processor'

describe('AgentChatDispatchHandoffProcessor', () => {
	const flushPromises = async () => {
		await Promise.resolve()
		await Promise.resolve()
	}

	const createContext = () => ({
		runId: 'run-id',
		traceId: 'trace-id',
		abortSignal: new AbortController().signal
	})

	const createMessage = (payload: Record<string, unknown>, headers?: Record<string, string>) => ({
		id: 'message-id',
		type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
		version: 1,
		tenantId: 'tenant-id',
		sessionKey: 'session-id',
		businessKey: 'business-id',
		attempt: 1,
		maxAttempts: 1,
		enqueuedAt: Date.now(),
		traceId: 'trace-id',
		payload,
		headers: {
			source: 'lark',
			...(headers ?? {})
		}
	})

	it('returns dead when required payload fields are missing', async () => {
		const commandBus = { execute: jest.fn() }
		const handoffQueueService = { enqueue: jest.fn() }
		const processor = new AgentChatDispatchHandoffProcessor(
			commandBus as any,
			handoffQueueService as any
		)

		const result = await processor.process(
			createMessage({
				options: { xpertId: 'xpert-id' },
				callback: { messageType: 'channel.lark.chat_stream_event.v1' }
			}) as any,
			createContext() as any
		)

		expect(result).toEqual({
			status: 'dead',
			reason: 'Missing request in agent chat dispatch payload'
		})
	})

	it('returns dead when a send request is missing message.input', async () => {
		const commandBus = { execute: jest.fn() }
		const handoffQueueService = { enqueue: jest.fn() }
		const processor = new AgentChatDispatchHandoffProcessor(
			commandBus as any,
			handoffQueueService as any
		)

		const result = await processor.process(
			createMessage({
				request: {
					action: 'send',
					message: null
				},
				options: { xpertId: 'xpert-id' },
				callback: { messageType: 'channel.lark.chat_stream_event.v1' }
			}) as any,
			createContext() as any
		)

		expect(result).toEqual({
			status: 'dead',
			reason: 'Invalid send request in agent chat dispatch payload: message.input is required'
		})
		expect(commandBus.execute).not.toHaveBeenCalled()
	})

	it('converts stream events to callback messages with increasing sequence', async () => {
		const commandBus = { execute: jest.fn() }
		const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
		const processor = new AgentChatDispatchHandoffProcessor(
			commandBus as any,
			handoffQueueService as any
		)

		commandBus.execute.mockResolvedValue(
			of(
				{ data: { type: 'message', data: 'hello' } } as MessageEvent,
				{ data: { type: 'message', data: 'world' } } as MessageEvent
			)
		)

		const result = await processor.process(
			createMessage({
				request: { input: { input: 'hello world' } },
				options: { xpertId: 'xpert-id' },
				callback: {
					messageType: 'channel.lark.chat_stream_event.v1',
					context: { integrationId: 'integration-id' }
				}
			}) as any,
			createContext() as any
		)

		expect(result).toEqual({ status: 'ok' })
		expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(2)

		const callbackPayloads = handoffQueueService.enqueue.mock.calls.map(
			([callbackMessage]: [{ payload: { sequence: number; kind: string; event?: MessageEvent } }]) => callbackMessage.payload
		)
		expect(callbackPayloads.map((payload) => payload.sequence)).toEqual([1, 2])
		expect(callbackPayloads.map((payload) => payload.kind)).toEqual(['stream', 'complete'])
		expect(callbackPayloads[0].event?.data).toEqual({ type: 'message', data: 'helloworld' })
	})

	it('flushes coalesced text before non-text stream events', async () => {
		const commandBus = { execute: jest.fn() }
		const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
		const processor = new AgentChatDispatchHandoffProcessor(
			commandBus as any,
			handoffQueueService as any
		)
		const progressEvent = { data: { type: 'event', event: 'on_chat_event', data: { id: 'progress' } } } as MessageEvent

		commandBus.execute.mockResolvedValue(
			of(
				{ data: { type: 'message', data: 'hello' } } as MessageEvent,
				{ data: { type: 'message', data: { type: 'text', text: ' world' } } } as MessageEvent,
				progressEvent
			)
		)

		const result = await processor.process(
			createMessage({
				request: { input: { input: 'hello world' } },
				options: { xpertId: 'xpert-id' },
				callback: {
					messageType: 'channel.lark.chat_stream_event.v1'
				}
			}) as any,
			createContext() as any
		)

		expect(result).toEqual({ status: 'ok' })
		expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(3)

		const callbackPayloads = handoffQueueService.enqueue.mock.calls.map(
			([callbackMessage]: [{ payload: { sequence: number; kind: string; event?: MessageEvent } }]) => callbackMessage.payload
		)
		expect(callbackPayloads.map((payload) => payload.sequence)).toEqual([1, 2, 3])
		expect(callbackPayloads[0].event?.data).toEqual({ type: 'message', data: 'hello world' })
		expect(callbackPayloads[1].event).toBe(progressEvent)
		expect(callbackPayloads[2].kind).toBe('complete')
	})

	it('skips lark acp_output events without flushing coalesced text', async () => {
		const commandBus = { execute: jest.fn() }
		const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
		const processor = new AgentChatDispatchHandoffProcessor(
			commandBus as any,
			handoffQueueService as any
		)
		const acpOutputEvent = {
			data: {
				type: 'event',
				event: 'on_chat_event',
				data: {
					type: 'acp_output',
					id: 'acp-output:session:1',
					text: '.'
				}
			}
		} as MessageEvent

		commandBus.execute.mockResolvedValue(
			of(
				{ data: { type: 'message', data: 'hello' } } as MessageEvent,
				acpOutputEvent,
				{ data: { type: 'message', data: ' world' } } as MessageEvent
			)
		)

		const result = await processor.process(
			createMessage({
				request: { input: { input: 'hello world' } },
				options: { xpertId: 'xpert-id' },
				callback: {
					messageType: 'channel.lark.chat_stream_event.v1'
				}
			}) as any,
			createContext() as any
		)

		expect(result).toEqual({ status: 'ok' })
		expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(2)

		const callbackPayloads = handoffQueueService.enqueue.mock.calls.map(
			([callbackMessage]: [{ payload: { kind: string; event?: MessageEvent } }]) => callbackMessage.payload
		)
		expect(callbackPayloads.map((payload) => payload.kind)).toEqual(['stream', 'complete'])
		expect(callbackPayloads[0].event?.data).toEqual({ type: 'message', data: 'hello world' })
		expect(callbackPayloads.some((payload) => payload.event === acpOutputEvent)).toBe(false)
	})

	it('keeps acp_output events for non-lark callbacks', async () => {
		const commandBus = { execute: jest.fn() }
		const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
		const processor = new AgentChatDispatchHandoffProcessor(
			commandBus as any,
			handoffQueueService as any
		)
		const acpOutputEvent = {
			data: {
				type: 'event',
				event: 'on_chat_event',
				data: {
					type: 'acp_output',
					id: 'acp-output:session:1',
					text: '.'
				}
			}
		} as MessageEvent

		commandBus.execute.mockResolvedValue(
			of(
				{ data: { type: 'message', data: 'hello' } } as MessageEvent,
				acpOutputEvent
			)
		)

		const result = await processor.process(
			createMessage(
				{
					request: { input: { input: 'hello world' } },
					options: { xpertId: 'xpert-id' },
					callback: {
						messageType: 'channel.other.chat_stream_event.v1'
					}
				},
				{ source: 'other' }
			) as any,
			createContext() as any
		)

		expect(result).toEqual({ status: 'ok' })
		expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(3)

		const callbackPayloads = handoffQueueService.enqueue.mock.calls.map(
			([callbackMessage]: [{ payload: { kind: string; event?: MessageEvent } }]) => callbackMessage.payload
		)
		expect(callbackPayloads.map((payload) => payload.kind)).toEqual(['stream', 'stream', 'complete'])
		expect(callbackPayloads[0].event?.data).toEqual({ type: 'message', data: 'hello' })
		expect(callbackPayloads[1].event).toBe(acpOutputEvent)
	})

	it('flushes coalesced text after the short window', async () => {
		jest.useFakeTimers()
		const commandBus = { execute: jest.fn() }
		const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
		const processor = new AgentChatDispatchHandoffProcessor(
			commandBus as any,
			handoffQueueService as any
		)
		const abortController = new AbortController()

		commandBus.execute.mockResolvedValue(
			new Observable<MessageEvent>((subscriber) => {
				subscriber.next({ data: { type: 'message', data: 'hello' } } as MessageEvent)
				subscriber.next({ data: { type: 'message', data: ' world' } } as MessageEvent)
			})
		)

		try {
			const processPromise = processor.process(
				createMessage({
					request: { input: { input: 'hello world' } },
					options: { xpertId: 'xpert-id' },
					callback: {
						messageType: 'channel.lark.chat_stream_event.v1'
					}
				}) as any,
				{
					runId: 'run-id',
					traceId: 'trace-id',
					abortSignal: abortController.signal
				} as any
			)

			await flushPromises()
			expect(handoffQueueService.enqueue).not.toHaveBeenCalled()

			jest.advanceTimersByTime(199)
			await flushPromises()
			expect(handoffQueueService.enqueue).not.toHaveBeenCalled()

			jest.advanceTimersByTime(1)
			await flushPromises()
			expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(1)
			expect(handoffQueueService.enqueue.mock.calls[0][0].payload.event.data).toEqual({
				type: 'message',
				data: 'hello world'
			})

			abortController.abort()
			await processPromise
			expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(2)
			expect(handoffQueueService.enqueue.mock.calls[1][0].payload.kind).toBe('error')
		} finally {
			jest.useRealTimers()
		}
	})

	it('emits error callback message when source observable fails', async () => {
		const commandBus = { execute: jest.fn() }
		const handoffQueueService = { enqueue: jest.fn().mockResolvedValue({ id: 'callback-job-id' }) }
		const processor = new AgentChatDispatchHandoffProcessor(
			commandBus as any,
			handoffQueueService as any
		)

		commandBus.execute.mockResolvedValue(
			new Observable<MessageEvent>((subscriber) => {
				subscriber.error(new Error('boom'))
			})
		)

		const result = await processor.process(
			createMessage({
				request: { input: { input: 'hello world' } },
				options: { xpertId: 'xpert-id' },
				callback: {
					messageType: 'channel.lark.chat_stream_event.v1'
				}
			}) as any,
			createContext() as any
		)

		expect(result).toEqual({ status: 'ok' })
		expect(handoffQueueService.enqueue).toHaveBeenCalledTimes(1)
		expect(handoffQueueService.enqueue.mock.calls[0][0].payload.kind).toBe('error')
		expect(handoffQueueService.enqueue.mock.calls[0][0].payload.error).toBe('boom')
	})
})

describe('AgentChatCallbackNoopHandoffProcessor', () => {
	it.each(['stream', 'complete', 'error'] as const)(
		'returns ok for %s callback envelopes',
		async (kind) => {
		const processor = new AgentChatCallbackNoopHandoffProcessor()
		const payload =
			kind === 'stream'
				? {
						kind,
						sourceMessageId: 'source-id',
						sequence: 1,
						event: { type: 'message', data: 'hello' }
					}
				: kind === 'error'
					? {
							kind,
							sourceMessageId: 'source-id',
							sequence: 1,
							error: 'boom'
						}
					: {
							kind,
							sourceMessageId: 'source-id',
							sequence: 1
						}

		const result = await processor.process(
			{
				id: 'callback-id',
				type: 'agent.chat_callback.noop.v1',
				version: 1,
				tenantId: 'tenant-id',
				sessionKey: 'session-id',
				businessKey: 'business-id',
				attempt: 1,
				maxAttempts: 1,
				enqueuedAt: Date.now(),
				traceId: 'trace-id',
				payload
			} as any,
			{
				runId: 'run-id',
				traceId: 'trace-id',
				abortSignal: new AbortController().signal
			} as any
		)

		expect(result).toEqual({ status: 'ok' })
		}
	)
})
