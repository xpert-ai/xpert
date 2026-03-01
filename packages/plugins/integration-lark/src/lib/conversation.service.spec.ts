import { LarkConversationService } from './conversation.service'
import {
	CancelConversationCommand,
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	RequestContext
} from '@xpert-ai/plugin-sdk'
import { ChatLarkContext, LARK_CONFIRM, LARK_END_CONVERSATION, LARK_REJECT } from './types'
import { LarkTriggerStrategy } from './workflow/lark-trigger.strategy'

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

type PersistedConversationBinding = {
	userId?: string | null
	conversationUserKey: string
	xpertId: string
	conversationId: string
	tenantId?: string | null
	organizationId?: string | null
	createdById?: string | null
	updatedById?: string | null
	updatedAt?: Date
}

describe('LarkConversationService', () => {
	const userId = 'user-1'
	const xpertId = 'xpert-1'

	function createChatContext(): ChatLarkContext {
		return {
			tenant: null as any,
			organizationId: 'org-1',
			integrationId: 'integration-1',
			userId,
			chatId: 'chat-1'
		}
	}

	function createFixture(params?: {
		boundXpertId?: string | null
		triggerHandled?: boolean
		legacyXpertId?: string | null
		conversationBindings?: PersistedConversationBinding[]
	}) {
		const persistedConversationBindings = [...(params?.conversationBindings ?? [])]
		let bindingSequence = persistedConversationBindings.length
		const nextUpdatedAt = () => {
			bindingSequence += 1
			return new Date(bindingSequence * 1000)
		}
		const commandBus = {
			execute: jest.fn().mockResolvedValue(undefined)
		}
		const dispatchService = {
			enqueueDispatch: jest.fn().mockResolvedValue('ok')
		}
		const integrationPermissionService = {
			read: jest.fn().mockResolvedValue({
				id: 'integration-1',
				options: {
					xpertId: params?.legacyXpertId === undefined ? 'legacy-xpert' : params.legacyXpertId,
					preferLanguage: 'en_US'
				}
			})
		}
		const larkTriggerStrategy = {
			getBoundXpertId: jest
				.fn()
				.mockResolvedValue(params?.boundXpertId === undefined ? null : params.boundXpertId),
			handleInboundMessage: jest
				.fn()
				.mockResolvedValue(params?.triggerHandled === undefined ? false : params.triggerHandled)
		}
		const conversationBindingRepository = {
			findOne: jest
				.fn()
				.mockImplementation(
					async ({
						where,
						order
					}: {
						where: Partial<PersistedConversationBinding>
						order?: {
							updatedAt?: 'ASC' | 'DESC'
						}
					}) => {
					if (where.userId !== undefined) {
						return persistedConversationBindings.find((item) => item.userId === where.userId) ?? null
					}
					if (where.conversationUserKey && where.xpertId) {
						return (
							persistedConversationBindings.find(
								(item) =>
									item.conversationUserKey === where.conversationUserKey && item.xpertId === where.xpertId
							) ?? null
						)
					}
					if (where.xpertId) {
						const items = persistedConversationBindings.filter((item) => item.xpertId === where.xpertId)
						if (!items.length) {
							return null
						}
						const toTime = (value?: Date) => (value instanceof Date ? value.getTime() : 0)
						items.sort((a, b) => {
							if (order?.updatedAt === 'ASC') {
								return toTime(a.updatedAt) - toTime(b.updatedAt)
							}
							return toTime(b.updatedAt) - toTime(a.updatedAt)
						})
						return items[0]
					}
					return null
				}
				),
			upsert: jest
				.fn()
				.mockImplementation(
					async (
						payload: PersistedConversationBinding,
						conflictPaths: Array<'userId' | 'conversationUserKey' | 'xpertId'>
					) => {
						if (conflictPaths.includes('userId') && payload.userId) {
							const index = persistedConversationBindings.findIndex(
								(item) => item.userId === payload.userId
							)
							if (index >= 0) {
								persistedConversationBindings[index] = {
									...persistedConversationBindings[index],
									...payload,
									updatedAt: nextUpdatedAt()
								}
							} else {
								persistedConversationBindings.push({
									...payload,
									updatedAt: payload.updatedAt ?? nextUpdatedAt()
								})
							}
						} else {
							const index = persistedConversationBindings.findIndex(
								(item) =>
									item.conversationUserKey === payload.conversationUserKey && item.xpertId === payload.xpertId
							)
							if (index >= 0) {
								persistedConversationBindings[index] = {
									...persistedConversationBindings[index],
									...payload,
									updatedAt: nextUpdatedAt()
								}
							} else {
								persistedConversationBindings.push({
									...payload,
									updatedAt: payload.updatedAt ?? nextUpdatedAt()
								})
							}
						}
						return { generatedMaps: [], raw: [], identifiers: [] }
					}
				),
			delete: jest
				.fn()
				.mockImplementation(async (criteria: Partial<PersistedConversationBinding>) => {
					let removed = 0
					for (let index = persistedConversationBindings.length - 1; index >= 0; index--) {
						const item = persistedConversationBindings[index]
						const matchUserId = criteria.userId === undefined || item.userId === criteria.userId
						const matchUserKey =
							criteria.conversationUserKey === undefined ||
							item.conversationUserKey === criteria.conversationUserKey
						const matchXpertId = criteria.xpertId === undefined || item.xpertId === criteria.xpertId
						if (matchUserId && matchUserKey && matchXpertId) {
							persistedConversationBindings.splice(index, 1)
							removed++
						}
					}
					return { affected: removed }
				})
		}
		const pluginContext = {
			resolve: jest.fn((token: unknown) => {
				if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
					return integrationPermissionService
				}
				if (token === LarkTriggerStrategy) {
					return larkTriggerStrategy
				}
				throw new Error(`Unexpected token: ${String(token)}`)
			})
		}
		const cache = new MemoryCache()
		const larkChannel = {
			errorMessage: jest.fn().mockResolvedValue(undefined),
			patchInteractiveMessage: jest.fn().mockResolvedValue(undefined),
			interactiveMessage: jest.fn().mockResolvedValue({ data: { message_id: 'generated-lark-message-id' } })
		}
		const service = new LarkConversationService(
			commandBus as any,
			dispatchService as any,
			cache as any,
			larkChannel as any,
			conversationBindingRepository as any,
			pluginContext as any
		)

		return {
			service,
			commandBus,
			dispatchService,
			larkChannel,
			integrationPermissionService,
			larkTriggerStrategy,
			conversationBindingRepository,
			persistedConversationBindings
		}
	}

	beforeEach(() => {
		jest.restoreAllMocks()
	})

	it('setConversation persists to binding table and resolves latest by open_id', async () => {
		const { service, conversationBindingRepository } = createFixture()

		await service.setConversation('open_id:ou_sender_1', 'xpert-1', 'conversation-1')

		expect(conversationBindingRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'ou_sender_1',
				conversationUserKey: 'open_id:ou_sender_1',
				xpertId: 'xpert-1',
				conversationId: 'conversation-1'
			}),
			['userId']
		)
		expect(await service.getLatestConversationBindingByUserId('ou_sender_1')).toEqual({
			xpertId: 'xpert-1',
			conversationId: 'conversation-1',
			conversationUserKey: 'open_id:ou_sender_1'
		})
	})

	it('setConversation for non-open_id binding does not participate latest user lookup', async () => {
		const { service, conversationBindingRepository } = createFixture()

		await service.setConversation('email:target@example.com', 'xpert-1', 'conversation-1')

		expect(conversationBindingRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: null,
				conversationUserKey: 'email:target@example.com',
				xpertId: 'xpert-1',
				conversationId: 'conversation-1'
			}),
			['conversationUserKey', 'xpertId']
		)
		expect(await service.getLatestConversationBindingByUserId('target@example.com')).toBeNull()
		expect(await service.getConversation('email:target@example.com', 'xpert-1')).toBe('conversation-1')
	})

	it('resolveDispatchExecutionContext uses exact binding when exact context is complete', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-1',
					conversationId: 'conversation-1',
					tenantId: 'tenant-exact',
					organizationId: 'org-exact',
					createdById: 'creator-exact',
					updatedAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					userId: 'ou_sender_2',
					conversationUserKey: 'open_id:ou_sender_2',
					xpertId: 'xpert-1',
					conversationId: 'conversation-2',
					tenantId: 'tenant-latest',
					organizationId: 'org-latest',
					createdById: 'creator-latest',
					updatedAt: new Date('2026-02-01T00:00:00.000Z')
				}
			]
		})

		await expect(
			service.resolveDispatchExecutionContext('xpert-1', 'open_id:ou_sender_1')
		).resolves.toEqual({
			tenantId: 'tenant-exact',
			organizationId: 'org-exact',
			createdById: 'creator-exact',
			source: 'exact'
		})
	})

	it('resolveDispatchExecutionContext fills missing exact fields from latest xpert binding', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-1',
					conversationId: 'conversation-1',
					tenantId: 'tenant-exact',
					organizationId: null,
					createdById: null,
					updatedAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					userId: 'ou_sender_2',
					conversationUserKey: 'open_id:ou_sender_2',
					xpertId: 'xpert-1',
					conversationId: 'conversation-2',
					tenantId: 'tenant-latest',
					organizationId: 'org-latest',
					createdById: 'creator-latest',
					updatedAt: new Date('2026-02-01T00:00:00.000Z')
				}
			]
		})

		await expect(
			service.resolveDispatchExecutionContext('xpert-1', 'open_id:ou_sender_1')
		).resolves.toEqual({
			tenantId: 'tenant-exact',
			organizationId: 'org-latest',
			createdById: 'creator-latest',
			source: 'exact'
		})
	})

	it('resolveDispatchExecutionContext falls back to latest xpert binding when exact binding missing', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-1',
					conversationId: 'conversation-1',
					tenantId: 'tenant-older',
					organizationId: 'org-older',
					createdById: 'creator-older',
					updatedAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					userId: 'ou_sender_2',
					conversationUserKey: 'open_id:ou_sender_2',
					xpertId: 'xpert-1',
					conversationId: 'conversation-2',
					tenantId: 'tenant-newest',
					organizationId: 'org-newest',
					createdById: 'creator-newest',
					updatedAt: new Date('2026-02-01T00:00:00.000Z')
				}
			]
		})

		await expect(
			service.resolveDispatchExecutionContext('xpert-1', 'open_id:ou_sender_3')
		).resolves.toEqual({
			tenantId: 'tenant-newest',
			organizationId: 'org-newest',
			createdById: 'creator-newest',
			source: 'xpert-latest'
		})
	})

	it('getConversation falls back to persisted binding table on cache miss', async () => {
		const { service, conversationBindingRepository } = createFixture({
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})

		const first = await service.getConversation('open_id:ou_sender_1', 'xpert-from-db')
		const second = await service.getConversation('open_id:ou_sender_1', 'xpert-from-db')

		expect(first).toBe('conversation-from-db')
		expect(second).toBe('conversation-from-db')
		expect(conversationBindingRepository.findOne).toHaveBeenCalledTimes(1)
	})

	it.each([LARK_CONFIRM, LARK_REJECT, LARK_END_CONVERSATION])(
		'returns timeout and clears caches when active message is missing (%s)',
		async (action) => {
			const { service, larkChannel } = createFixture()
			await service.setConversation(userId, xpertId, 'conversation-1')

			await service.onAction(action, createChatContext(), userId, xpertId, 'action-message-id')

			expect(larkChannel.errorMessage).toHaveBeenCalledTimes(1)
			expect(await service.getConversation(userId, xpertId)).toBeUndefined()
			expect(await service.getActiveMessage(userId, xpertId)).toBeNull()
		}
	)

	it('uses action.messageId fallback when cached thirdPartyMessage.id is missing', async () => {
		const { service, larkChannel, commandBus, dispatchService } = createFixture()
		await service.setConversation(userId, xpertId, 'conversation-1')
		await service.setActiveMessage(userId, xpertId, {
			id: 'chat-message-id',
			thirdPartyMessage: {
				messageId: 'chat-message-id',
				language: 'en_US',
				header: null,
				elements: [{ tag: 'markdown', content: 'cached body' }],
				status: 'thinking'
			}
		})

		await service.onAction(LARK_CONFIRM, createChatContext(), userId, xpertId, 'action-message-id')

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledWith(
			'integration-1',
			'action-message-id',
			expect.any(Object)
		)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		expect(patchPayload.elements).toContainEqual({ tag: 'markdown', content: 'cached body' })
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch.mock.calls[0][0].options).toEqual({ confirm: true })
		expect(commandBus.execute).not.toHaveBeenCalled()
	})

	it('keeps existing card content on end, cancels conversation and clears conversation session', async () => {
		const { service, larkChannel, commandBus, dispatchService } = createFixture()
		await service.setConversation(userId, xpertId, 'conversation-1')
		await service.setActiveMessage(userId, xpertId, {
			id: 'chat-message-id',
			thirdPartyMessage: {
				id: 'cached-lark-message-id',
				messageId: 'chat-message-id',
				language: 'en_US',
				header: null,
				elements: [{ tag: 'markdown', content: 'persisted body' }],
				status: 'thinking'
			}
		})

		await service.onAction(LARK_END_CONVERSATION, createChatContext(), userId, xpertId)

		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledTimes(1)
		expect(larkChannel.patchInteractiveMessage).toHaveBeenCalledWith(
			'integration-1',
			'cached-lark-message-id',
			expect.any(Object)
		)
		const patchPayload = (larkChannel.patchInteractiveMessage as jest.Mock).mock.calls[0][2]
		expect(
			patchPayload.elements.some(
				(element: { tag?: string; content?: string }) =>
					element.tag === 'markdown' && element.content === 'persisted body'
			)
		).toBe(true)
		expect(commandBus.execute).toHaveBeenCalledTimes(1)
		expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(CancelConversationCommand)
		expect(commandBus.execute.mock.calls[0][0].input).toEqual({ conversationId: 'conversation-1' })
		expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
		expect(await service.getConversation(userId, xpertId)).toBeUndefined()
		expect(await service.getActiveMessage(userId, xpertId)).toBeNull()
	})

	it('handleCardAction prioritizes latest binding by open_id over integration default xpert', async () => {
		const { service } = createFixture({
			conversationBindings: [
				{
					userId: 'ou-action-1',
					conversationUserKey: 'open_id:ou-action-1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})
		const onAction = jest.spyOn(service, 'onAction').mockResolvedValue(undefined as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: userId,
			tenantId: 'tenant-1'
		} as any)

		await service.handleCardAction(
			{
				value: LARK_CONFIRM,
				userId: 'ou-action-1',
				chatId: 'chat-1',
				messageId: 'action-message-id'
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						xpertId: 'xpert-from-integration'
					}
				}
			} as any
		)

		expect(onAction).toHaveBeenCalledWith(
			LARK_CONFIRM,
			expect.objectContaining({
				userId,
				senderOpenId: 'ou-action-1'
			}),
			'open_id:ou-action-1',
			'xpert-from-db',
			'action-message-id'
		)
	})

	it('skips card action handling when action open_id is missing', async () => {
		const { service } = createFixture()
		const onAction = jest.spyOn(service, 'onAction').mockResolvedValue(undefined as any)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: userId,
			tenantId: 'tenant-1'
		} as any)

		await service.handleCardAction(
			{
				value: LARK_CONFIRM,
				chatId: 'chat-1',
				messageId: 'action-message-id'
			} as any,
			{
				organizationId: 'org-1',
				integration: {
					id: 'integration-1',
					tenant: null,
					options: {
						xpertId
					}
				}
			} as any
		)

		expect(onAction).not.toHaveBeenCalled()
	})

	it('processMessage prioritizes latest conversation binding and bypasses trigger routing', async () => {
		const { service, larkTriggerStrategy, dispatchService, larkChannel } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerHandled: true,
			legacyXpertId: 'legacy-xpert',
			conversationBindings: [
				{
					userId: 'ou_sender_1',
					conversationUserKey: 'open_id:ou_sender_1',
					xpertId: 'xpert-from-db',
					conversationId: 'conversation-from-db'
				}
			]
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch.mock.calls[0][0].xpertId).toBe('xpert-from-db')
		expect(larkChannel.errorMessage).not.toHaveBeenCalled()
	})

	it('processMessage falls back to trigger strategy when latest binding does not exist', async () => {
		const { service, larkTriggerStrategy, dispatchService, larkChannel } = createFixture({
			boundXpertId: 'trigger-xpert',
			triggerHandled: true,
			legacyXpertId: 'legacy-xpert'
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
		expect(larkChannel.errorMessage).not.toHaveBeenCalled()
	})

	it('processMessage falls back to legacy xpert dispatch when trigger is not handled', async () => {
		const { service, larkTriggerStrategy, dispatchService } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: 'legacy-xpert'
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(larkTriggerStrategy.handleInboundMessage).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
		expect(dispatchService.enqueueDispatch.mock.calls[0][0].xpertId).toBe('legacy-xpert')
	})

	it('processMessage returns error when neither latest binding nor integration fallback is configured', async () => {
		const { service, dispatchService, larkChannel } = createFixture({
			boundXpertId: null,
			triggerHandled: false,
			legacyXpertId: null
		})

		await service.processMessage({
			userId: 'user-1',
			senderOpenId: 'ou_sender_1',
			integrationId: 'integration-1',
			chatId: 'chat-1',
			message: {
				message: {
					content: JSON.stringify({ text: 'hello' })
				}
			}
		} as any)

		expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
		expect(larkChannel.errorMessage).toHaveBeenCalledTimes(1)
	})
})
