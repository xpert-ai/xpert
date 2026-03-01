import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { LarkChatStreamCallbackProcessor } from './lark-chat-callback.processor'
import { LarkChatRunState, LarkChatRunStateService } from './lark-chat-run-state.service'

class MemoryCache {
	private readonly store = new Map<string, unknown>()

	async set(key: string, value: unknown) {
		this.store.set(key, value)
	}

	async get<T = unknown>(key: string): Promise<T | undefined> {
		return this.store.get(key) as T | undefined
	}

	async del(key: string) {
		this.store.delete(key)
	}
}

describe('LarkChatStreamCallbackProcessor', () => {
	afterEach(() => {
		delete process.env['INTEGRATION_LARK_STREAM_UPDATE_WINDOW_MS']
		jest.useRealTimers()
		jest.restoreAllMocks()
	})

	function createFixture(
		config: {
			streaming?: {
				updateWindowMs?: number
			}
		} = {}
	) {
		const cache = new MemoryCache()
		const runStateService = new LarkChatRunStateService(cache as any)
		const pluginContext = {
			resolve: jest.fn(),
			config
		}
		const larkChannel = {
			patchInteractiveMessage: jest.fn().mockResolvedValue(undefined),
			interactiveMessage: jest.fn().mockResolvedValue({ data: { message_id: 'new-lark-id' } }),
			translate: jest.fn().mockImplementation((key: string) => key)
		}
		const conversationService = {
			setConversation: jest.fn().mockResolvedValue(undefined),
			setActiveMessage: jest.fn().mockResolvedValue(undefined)
		}

		const processor = new LarkChatStreamCallbackProcessor(
			larkChannel as any,
			runStateService,
			pluginContext as any
		)
		;(processor as any).conversationService = conversationService as any

		return {
			runStateService,
			larkChannel,
			conversationService,
			processor
		}
	}

	function createRunState(overrides: Partial<LarkChatRunState> = {}): LarkChatRunState {
		const baseContext = {
			tenantId: 'tenant-id',
			organizationId: 'organization-id',
			userId: 'user-id',
			xpertId: 'xpert-id',
			integrationId: 'integration-id',
			chatId: 'chat-id',
			senderOpenId: 'open-id',
			requestContext: {
				user: {
					id: 'user-id',
					tenantId: 'tenant-id'
				},
				headers: {
					['tenant-id']: 'tenant-id'
				}
			},
			message: {
				id: 'lark-message-id',
				messageId: 'chat-message-id',
				status: 'thinking',
				language: 'en_US',
				header: null,
				elements: [],
				text: 'hello'
			}
		}
		const {
			context,
			pendingEvents,
			lastFlushAt,
			lastFlushedLength,
			...rest
		} = overrides

		return {
			sourceMessageId: 'run-1',
			nextSequence: 1,
			responseMessageContent: '',
			context: {
				...baseContext,
				...(context ?? {})
			},
			pendingEvents: pendingEvents ?? {},
			lastFlushAt: lastFlushAt ?? 0,
			lastFlushedLength: lastFlushedLength ?? 0,
			renderItems: (baseContext.message?.elements ?? []).map((element) => ({
				kind: 'structured' as const,
				element: { ...element }
			})),
			...rest
		}
	}

	function createProcessContext() {
		return {
			runId: 'run-id',
			traceId: 'trace-id',
			abortSignal: new AbortController().signal
		}
	}

	function createStreamMessage(sequence: number, data: unknown, sourceMessageId: string = 'run-1') {
		return {
			id: `callback-${sequence}`,
			type: 'channel.lark.chat_stream_event.v1',
			version: 1,
			tenantId: 'tenant-id',
			sessionKey: 'session-id',
			businessKey: 'business-id',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: 1,
			traceId: 'trace-id',
			payload: {
				kind: 'stream',
				sourceMessageId,
				sequence,
				event: {
					data: {
						type: ChatMessageTypeEnum.MESSAGE,
						data
					}
				}
			}
		}
	}

	function createCompleteMessage(sequence: number, sourceMessageId: string = 'run-1') {
		return {
			id: `callback-${sequence}`,
			type: 'channel.lark.chat_stream_event.v1',
			version: 1,
			tenantId: 'tenant-id',
			sessionKey: 'session-id',
			businessKey: 'business-id',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: 1,
			traceId: 'trace-id',
			payload: {
				kind: 'complete',
				sourceMessageId,
				sequence
			}
		}
	}

	function createEventMessage(
		sequence: number,
		event: ChatMessageEventTypeEnum,
		data: unknown,
		sourceMessageId: string = 'run-1'
	) {
		return {
			id: `callback-${sequence}`,
			type: 'channel.lark.chat_stream_event.v1',
			version: 1,
			tenantId: 'tenant-id',
			sessionKey: 'session-id',
			businessKey: 'business-id',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: 1,
			traceId: 'trace-id',
			payload: {
				kind: 'stream',
				sourceMessageId,
				sequence,
				event: {
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event,
						data
					}
				}
			}
		}
	}

	function createErrorMessage(sequence: number, error: string, sourceMessageId: string = 'run-1') {
		return {
			id: `callback-${sequence}`,
			type: 'channel.lark.chat_stream_event.v1',
			version: 1,
			tenantId: 'tenant-id',
			sessionKey: 'session-id',
			businessKey: 'business-id',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: 1,
			traceId: 'trace-id',
			payload: {
				kind: 'error',
				sourceMessageId,
				sequence,
				error
			}
		}
	}

	function getManagedEventElements(elements: any[]) {
		return (elements ?? []).filter(
			(element) =>
				element?.tag === 'markdown' &&
				typeof element?.content === 'string' &&
				element.content.includes('**Event:**')
		)
	}

	function getManagedStreamTextElements(elements: any[]) {
		return (elements ?? []).filter(
			(element) =>
				element?.tag === 'markdown' &&
				typeof element?.content === 'string' &&
				!element.content.includes('**Event:**') &&
				!element.content.includes("color='wathet'")
		)
	}

	it('flushes MESSAGE content when update window is reached', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1300)

			await runStateService.save(
				createRunState({
					lastFlushAt: 1000,
					context: {
						streaming: {
							updateWindowMs: 200
						}
					} as any
				})
			)

		await processor.process(createStreamMessage(1, 'hello') as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		const streamTextElements = getManagedStreamTextElements(patchPayload.elements)
		expect(streamTextElements).toHaveLength(1)
		expect(streamTextElements[0].content).toContain('hello')
		const thinkingIndex = patchPayload.elements.findIndex(
			(element: { tag?: string; content?: string }) =>
				element.tag === 'markdown' &&
				typeof element.content === 'string' &&
				element.content.includes("color='wathet'")
		)
		expect(thinkingIndex).toBeGreaterThan(-1)
		const actionIndex = patchPayload.elements.findIndex(
			(element: { tag?: string }) => element.tag === 'action'
		)
		expect(actionIndex).toBeGreaterThan(thinkingIndex)
		const state = await runStateService.get('run-1')
		expect(state?.lastFlushAt).toBe(1300)
		expect(state?.lastFlushedLength).toBe(5)
	})

	it('does not flush MESSAGE content before update window is reached', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1500)

			await runStateService.save(
				createRunState({
					lastFlushAt: 1000,
					context: {
						streaming: {
							updateWindowMs: 2000
						}
					} as any
				})
			)

		await processor.process(createStreamMessage(1, 'hello') as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(0)
		const state = await runStateService.get('run-1')
		expect(state?.responseMessageContent).toBe('hello')
		expect(state?.lastFlushAt).toBe(1000)
		expect(state?.lastFlushedLength).toBe(0)
	})

	it('handles out-of-order callbacks and flushes only when window condition is met', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(3000)

			await runStateService.save(
				createRunState({
					context: {
						streaming: {
							updateWindowMs: 2000
						}
					} as any
				})
			)

		await processor.process(createStreamMessage(2, 'world') as any, createProcessContext() as any)
		await processor.process(createStreamMessage(1, 'hello ') as any, createProcessContext() as any)

		let state = await runStateService.get('run-1')
		expect(state?.nextSequence).toBe(3)
		expect(state?.responseMessageContent).toBe('hello world')
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)

		jest.setSystemTime(5500)
		await processor.process(createStreamMessage(3, '!') as any, createProcessContext() as any)

		state = await runStateService.get('run-1')
		expect(state?.nextSequence).toBe(4)
		expect(state?.responseMessageContent).toBe('hello world!')
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(2)
	})

	it('keeps compatibility with structured update payload in MESSAGE callbacks', async () => {
		const { processor, runStateService, larkChannel } = createFixture()

		await runStateService.save(createRunState())

		await processor.process(
			createStreamMessage(1, {
				type: 'update',
				data: {
					elements: [{ tag: 'markdown', content: 'partial' }]
				}
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		expect(patchPayload.elements[0]).toEqual({
			tag: 'markdown',
			content: 'partial'
		})
	})

	it('renders ON_CHAT_EVENT and updates by event id instead of appending', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				title: 'Preparing',
				message: 'Loading resources',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(2, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				title: 'Ready',
				message: 'Resources ready',
				status: 'success'
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(2)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[1][2]
		const eventElements = getManagedEventElements(patchPayload.elements)
		expect(eventElements).toHaveLength(1)
		expect(eventElements[0].content).toContain(`**Event:** ${ChatMessageEventTypeEnum.ON_CHAT_EVENT}`)
		expect(eventElements[0].content).toContain('**Title:** Ready')
		expect(eventElements[0].content).toContain('Resources ready')
		expect(eventElements[0].content).toContain('**Status:** success')
		expect(eventElements[0].content).not.toContain('Preparing')
		const state = await runStateService.get('run-1')
		const eventItems = state?.renderItems.filter((item: any) => item.kind === 'event')
		expect(eventItems).toHaveLength(1)
		expect(eventItems?.[0]).toMatchObject({ id: 'event-1' })
	})

	it('renders tool lifecycle events and updates event content by tool id', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_TOOL_START, {
				id: 'tool-1',
				tool: 'answer_question',
				title: 'Answer Question',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(2, ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: 'tool-1',
				tool: 'answer_question',
				message: 'Querying cube'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(3, ChatMessageEventTypeEnum.ON_TOOL_END, {
				output: {
					tool_call_id: 'tool-1'
				},
				tool: 'answer_question',
				status: 'success',
				message: 'Completed'
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(3)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[2][2]
		const eventElements = getManagedEventElements(patchPayload.elements)
		expect(eventElements).toHaveLength(1)
		expect(eventElements[0].content).toContain(`**Event:** ${ChatMessageEventTypeEnum.ON_TOOL_END}`)
		expect(eventElements[0].content).toContain('**Tool:** answer_question')
		expect(eventElements[0].content).toContain('Completed')
		expect(eventElements[0].content).toContain('**Status:** success')
		expect(eventElements[0].content).not.toContain('Querying cube')
		const state = await runStateService.get('run-1')
		const eventItems = state?.renderItems.filter((item: any) => item.kind === 'event')
		expect(eventItems).toHaveLength(1)
		expect(eventItems?.[0]).toMatchObject({ id: 'tool-1' })
	})

	it('renders ON_TOOL_ERROR as event and resolves id from toolCall.id', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_TOOL_ERROR, {
				toolCall: {
					id: 'tool-err-1',
					name: 'answer_question'
				},
				error: 'Lexical error'
			}) as any,
			createProcessContext() as any
		)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		const eventElements = getManagedEventElements(patchPayload.elements)
		expect(eventElements).toHaveLength(1)
		expect(eventElements[0].content).toContain(`**Event:** ${ChatMessageEventTypeEnum.ON_TOOL_ERROR}`)
		expect(eventElements[0].content).toContain('**Tool:** answer_question')
		expect(eventElements[0].content).toContain('**Error:** Lexical error')
		const state = await runStateService.get('run-1')
		const eventItems = state?.renderItems.filter((item: any) => item.kind === 'event')
		expect(eventItems).toHaveLength(1)
		expect(eventItems?.[0]).toMatchObject({ id: 'tool-err-1' })
	})

	it('updates active message cache when ON_MESSAGE_START is received', async () => {
		const { processor, runStateService, conversationService } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_MESSAGE_START, {
				id: 'chat-message-2'
			}) as any,
			createProcessContext() as any
		)

		expect(conversationService.setActiveMessage).toHaveBeenCalledWith('open_id:open-id', 'xpert-id', {
			id: 'chat-message-2',
			thirdPartyMessage: {
				id: 'lark-message-id',
				messageId: 'chat-message-2',
				status: 'thinking',
				language: 'en_US',
				header: null,
				elements: []
			}
		})
	})

	it('falls back to request context language when message language is missing', async () => {
		const { processor, runStateService, conversationService } = createFixture()
		await runStateService.save(
			createRunState({
				context: {
					requestContext: {
						user: {
							id: 'user-id',
							tenantId: 'tenant-id'
						},
						headers: {
							['tenant-id']: 'tenant-id',
							language: 'zh-Hans'
						}
					},
					message: {
						id: 'lark-message-id',
						messageId: 'chat-message-id',
						status: 'thinking',
						language: undefined,
						header: null,
						elements: [],
						text: 'hello'
					}
				} as any
			})
		)

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_MESSAGE_START, {
				id: 'chat-message-2'
			}) as any,
			createProcessContext() as any
		)

		expect(conversationService.setActiveMessage).toHaveBeenCalledWith('open_id:open-id', 'xpert-id', {
			id: 'chat-message-2',
			thirdPartyMessage: {
				id: 'lark-message-id',
				messageId: 'chat-message-2',
				status: 'thinking',
				language: 'zh-Hans',
				header: null,
				elements: []
			}
		})
	})

	it('handles out-of-order stream callbacks and clears run state on complete', async () => {
		const { processor, runStateService } = createFixture()

		await runStateService.save(createRunState())

		await processor.process(createStreamMessage(2, 'world') as any, createProcessContext() as any)
		await processor.process(createStreamMessage(1, 'hello ') as any, createProcessContext() as any)

		const stateAfterStream = await runStateService.get('run-1')
		expect(stateAfterStream?.nextSequence).toBe(3)
		expect(stateAfterStream?.responseMessageContent).toBe('hello world')

		await processor.process(createCompleteMessage(3) as any, createProcessContext() as any)

		expect(await runStateService.get('run-1')).toBeNull()
	})

	it('does not append duplicate markdown when completing after flush', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1300)

		await runStateService.save(
			createRunState({
				lastFlushAt: 1000,
				context: {
					streaming: {
						updateWindowMs: 200
					}
				} as any
			})
		)

		await processor.process(createStreamMessage(1, 'hello') as any, createProcessContext() as any)
		await processor.process(createCompleteMessage(2) as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(2)
		const completePayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[1][2]
		const streamTextElements = getManagedStreamTextElements(completePayload.elements)
		expect(streamTextElements).toHaveLength(1)
		expect(streamTextElements[0].content).toContain('hello')
	})

	it('updates status to success on complete for structured update-only stream', async () => {
		const { processor, runStateService, larkChannel } = createFixture()

		await runStateService.save(createRunState())
		await processor.process(
			createStreamMessage(1, {
				type: 'update',
				data: {
					elements: [{ tag: 'markdown', content: 'partial' }]
				}
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createCompleteMessage(2) as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(2)
		const completePayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[1][2]
		const partialMarkdownCount = completePayload.elements.filter(
			(element: { tag?: string; content?: string }) =>
				element.tag === 'markdown' && element.content === 'partial'
		).length
		expect(partialMarkdownCount).toBe(1)
	})

	it('keeps chart and streams text in the same card after structured update', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1300)

		await runStateService.save(
			createRunState({
				lastFlushAt: 1000,
				context: {
					streaming: {
						updateWindowMs: 200
					}
				} as any
			})
		)

		await processor.process(
			createStreamMessage(1, {
				type: 'update',
				data: {
					elements: [{ tag: 'chart', chart_spec: { type: 'line' } }]
				}
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createStreamMessage(2, 'analysis text') as any, createProcessContext() as any)
		await processor.process(createCompleteMessage(3) as any, createProcessContext() as any)

		// structured update + text flush + complete
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(3)

		const streamPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[1][2]
		expect(streamPayload.elements.some((element: { tag?: string }) => element.tag === 'chart')).toBe(true)
		expect(
			streamPayload.elements.some(
				(element: { tag?: string; content?: string }) =>
					element.tag === 'markdown' &&
					typeof element.content === 'string' &&
					element.content.includes('analysis text')
			)
		).toBe(true)

		const completePayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[2][2]
		expect(completePayload.elements.some((element: { tag?: string }) => element.tag === 'chart')).toBe(true)
		expect(
			completePayload.elements.some(
				(element: { tag?: string; content?: string }) =>
					element.tag === 'markdown' &&
					typeof element.content === 'string' &&
					element.content.includes('analysis text')
			)
		).toBe(true)
	})

	it('mixes text chart and event elements in arrival order and updates event by id', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		jest.useFakeTimers()
		jest.setSystemTime(1000)

		await runStateService.save(
			createRunState({
				lastFlushAt: 0,
				context: {
					streaming: {
						updateWindowMs: 200
					}
				} as any
			})
		)

		await processor.process(createStreamMessage(1, 'A') as any, createProcessContext() as any)
		await processor.process(createStreamMessage(2, 'B') as any, createProcessContext() as any)
		await processor.process(
			createStreamMessage(3, {
				type: 'update',
				data: {
					elements: [{ tag: 'chart', chart_spec: { type: 'line' } }]
				}
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createStreamMessage(4, 'C') as any, createProcessContext() as any)

		jest.setSystemTime(1300)
		await processor.process(createStreamMessage(5, 'D') as any, createProcessContext() as any)
		await processor.process(
			createEventMessage(6, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				title: 'Preparing',
				message: 'Loading',
				status: 'running'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(
			createEventMessage(7, ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
				id: 'event-1',
				title: 'Done',
				message: 'Loaded',
				status: 'success'
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createCompleteMessage(8) as any, createProcessContext() as any)

		const calls = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls
		expect(calls.length).toBeGreaterThan(0)
		const finalPayload = calls[calls.length - 1][2]
		const streamTextElements = getManagedStreamTextElements(finalPayload.elements)
		expect(streamTextElements).toHaveLength(2)
		expect(streamTextElements[0].content).toContain('AB')
		expect(streamTextElements[1].content).toContain('CD')

		const firstTextIndex = finalPayload.elements.findIndex(
			(element: { tag?: string; content?: string }) =>
				element.tag === 'markdown' &&
				typeof element.content === 'string' &&
				element.content === 'AB'
		)
		const chartIndex = finalPayload.elements.findIndex((element: { tag?: string }) => element.tag === 'chart')
		const secondTextIndex = finalPayload.elements.findIndex(
			(element: { tag?: string; content?: string }) =>
				element.tag === 'markdown' &&
				typeof element.content === 'string' &&
				element.content === 'CD'
		)
		expect(firstTextIndex).toBeGreaterThan(-1)
		expect(chartIndex).toBeGreaterThan(-1)
		expect(secondTextIndex).toBeGreaterThan(-1)
		expect(firstTextIndex).toBeLessThan(chartIndex)
		expect(chartIndex).toBeLessThan(secondTextIndex)

		const eventElements = getManagedEventElements(finalPayload.elements)
		expect(eventElements).toHaveLength(1)
		expect(eventElements[0].content).toContain(`**Event:** ${ChatMessageEventTypeEnum.ON_CHAT_EVENT}`)
		expect(eventElements[0].content).toContain('**Title:** Done')
		expect(eventElements[0].content).toContain('Loaded')
		expect(eventElements[0].content).toContain('**Status:** success')
		expect(eventElements[0].content).not.toContain('Preparing')
	})

	it('keeps interrupted status when complete arrives after interrupted conversation end event', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(
			createEventMessage(1, ChatMessageEventTypeEnum.ON_CONVERSATION_END, {
				status: XpertAgentExecutionStatusEnum.INTERRUPTED,
				operation: {
					tasks: []
				}
			}) as any,
			createProcessContext() as any
		)
		await processor.process(createCompleteMessage(2) as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		expect(await runStateService.get('run-1')).toBeNull()
	})

	it('handles error callback and clears run state', async () => {
		const { processor, runStateService, larkChannel } = createFixture()
		await runStateService.save(createRunState())

		await processor.process(createErrorMessage(1, 'boom') as any, createProcessContext() as any)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		const errorPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		expect(errorPayload.elements[0]).toEqual({
			tag: 'markdown',
			content: 'boom'
		})
		expect(await runStateService.get('run-1')).toBeNull()
	})

	it('serializes same-source callbacks to avoid stale state overwrite', async () => {
		const { processor, runStateService } = createFixture()
		await runStateService.save(createRunState())

		const originalSave = runStateService.save.bind(runStateService)
		jest.spyOn(runStateService, 'save').mockImplementation(async (state, ttlSeconds) => {
			const isSequenceTwoSnapshot =
				state.nextSequence === 1 &&
				state.responseMessageContent === '' &&
				Boolean(state.pendingEvents?.['2']) &&
				!state.pendingEvents?.['1']
			if (isSequenceTwoSnapshot) {
				await new Promise((resolve) => setTimeout(resolve, 20))
			}
			await originalSave(state, ttlSeconds)
		})

		await Promise.all([
			processor.process(createStreamMessage(2, 'world') as any, createProcessContext() as any),
			processor.process(createStreamMessage(1, 'hello ') as any, createProcessContext() as any)
		])

		const state = await runStateService.get('run-1')
		expect(state?.nextSequence).toBe(3)
		expect(state?.responseMessageContent).toBe('hello world')
	})
})
