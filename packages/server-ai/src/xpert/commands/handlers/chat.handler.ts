import { RunnableLambda } from '@langchain/core/runnables'
import { BaseStore } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	CopilotChatMessage,
	figureOutXpert,
	IChatConversation,
	IChatMessage,
	IStorageFile,
	IXpert,
	LongTermMemoryTypeEnum,
	messageContentText,
	shortTitle,
	STATE_VARIABLE_HUMAN,
	TChatConversationStatus,
	TChatRequestHuman,
	TSensitiveOperation,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { appendMessageContent } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext, runWithRequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { catchError, concat, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { uniq } from 'lodash'
import {
	CancelSummaryJobCommand,
	ChatConversationUpsertCommand,
	GetChatConversationQuery,
	ScheduleSummaryJobCommand
} from '../../../chat-conversation/'
import { appendMessageSteps, ChatMessageUpsertCommand } from '../../../chat-message'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentChatCommand } from '../../../xpert-agent/'
import { XpertService } from '../../xpert.service'
import { XpertChatCommand } from '../chat.command'
import { CreateMemoryStoreCommand } from '../../../shared'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution'
import { CopilotCheckpointService } from '../../../copilot-checkpoint'
import {
	abortRunAfterDisconnectGrace,
	enqueueLocalTaskAndWait,
	ExecutionQueueService,
	LocalQueueTaskService,
	resolveClientDisconnectGraceMs
} from '../../../handoff'
import { HandoffQueueService } from '../../../handoff/dispatcher/message-queue.service'


@CommandHandler(XpertChatCommand)
export class XpertChatHandler implements ICommandHandler<XpertChatCommand> {
	readonly #logger = new Logger(XpertChatHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly checkpointService: CopilotCheckpointService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly executionRuntime: ExecutionQueueService,
		private readonly localQueueTaskService: LocalQueueTaskService,
		private readonly handoffQueue: HandoffQueueService,
	) {}

	public async execute(c: XpertChatCommand): Promise<Observable<MessageEvent>> {
		const { options } = c
		const optionContext = (options ?? {}) as {
			tenantId?: string
			organizationId?: string
			user?: any
		}
		const { projectId, conversationId, confirm, retry, command } = c.request
		let { input, state } = c.request
		const { xpertId, taskId, from, fromEndUserId } = options ?? {}
		let { execution } = options ?? {}
		const currentUser = RequestContext.currentUser() ?? optionContext.user
		const userId = RequestContext.currentUserId() ?? currentUser?.id
		let tenantId = RequestContext.currentTenantId() ?? optionContext.tenantId ?? currentUser?.tenantId
		let organizationId = RequestContext.getOrganizationId() ?? optionContext.organizationId

		if (!input) {
			input = state?.[STATE_VARIABLE_HUMAN]
		}
		if (!state) {
			state = { [STATE_VARIABLE_HUMAN]: input }
		}

		const timeStart = Date.now()

		const xpert = await this.xpertService.findOne(xpertId, { relations: ['agent', 'knowledgebase'] })
		tenantId = tenantId ?? xpert?.tenantId
		organizationId = organizationId ?? xpert?.organizationId
		const latestXpert = figureOutXpert(xpert, options?.isDraft)
		const abortController = new AbortController()
		const memory = latestXpert.memory
		const memoryStore: BaseStore | null = await this.commandBus.execute<CreateMemoryStoreCommand, BaseStore | null>(
			new CreateMemoryStoreCommand(
				tenantId,
				organizationId,
				latestXpert.memory?.copilotModel,
				{
					abortController,
					tokenCallback: (tokens: number) => {
						//
					}
				}
			)
		)
		
		let memories = null

		let conversation: IChatConversation
		let aiMessage: CopilotChatMessage
		let executionId: string
		let checkpointId: string = null
		// Continue thread when confirm or reject operation
		if (confirm || command) {
			conversation = await this.queryBus.execute(
				new GetChatConversationQuery({ id: conversationId }, ['messages'])
			)
			conversation.status = 'busy'
			aiMessage = conversation.messages[conversation.messages.length - 1] as CopilotChatMessage
			executionId = aiMessage.executionId

			// Cancel summary job
			if (memory?.enabled && memory.profile?.enabled) {
				await this.commandBus.execute(new CancelSummaryJobCommand(conversation.id))
			}
		} else {
			// New message in conversation
			if (conversationId) {
				conversation = await this.commandBus.execute(new ChatConversationUpsertCommand({
					id: conversationId,
					status: 'busy',
					error: null
				}, ['messages']))
						
				// Cancel summary job
				if (memory?.enabled && memory.profile?.enabled) {
					await this.commandBus.execute(new CancelSummaryJobCommand(conversation.id))
				}
			} else {
				// New conversation
				conversation = await this.commandBus.execute(
					new ChatConversationUpsertCommand({
						status: 'busy',
						projectId,
						taskId,
						xpert,
						options: {
							parameters: input,
						},
						from,
						fromEndUserId
					}, ['messages'])
				)

				// Remember
				if (memory?.enabled && memory.profile?.enabled && memoryStore) {
					memories = await getLongTermMemory(memoryStore, xpertId, input.input)
				}
			}

			// New execution (Run) in thread
			execution = await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...(execution ?? {}),
					xpert: { id: xpert.id } as IXpert,
					agentKey: xpert.agent.key,
					inputs: input,
					status: XpertAgentExecutionStatusEnum.RUNNING,
					threadId: conversation.threadId
				})
			)
			executionId = execution.id

			let userMessage: IChatMessage = null
			if (retry) {
				const retryMessage = conversation.messages.find((_) => _.id === c.options.messageId)
				const execution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(retryMessage.executionId))
				if (execution?.checkpointId) {
					const checkpoint = await this.checkpointService.findOne({
						where: {
							thread_id: conversation.threadId,
							checkpoint_ns: execution.checkpointNs ?? '',
							checkpoint_id: execution.checkpointId
						}
					})
					checkpointId = checkpoint?.parent_id ?? execution.checkpointId
				}
				userMessage = conversation.messages.find((_) => _.id === retryMessage.parentId)
			} else {
				const _humanMessage: Partial<IChatMessage> = {
					parent: conversation.messages[conversation.messages.length - 1],
					role: 'human',
					content: input.input,
					conversationId: conversation.id,
					...(input.files ? {
						attachments: input.files as IStorageFile[],
					} : {})
				}
				userMessage = await this.commandBus.execute(
					new ChatMessageUpsertCommand(_humanMessage)
				)
			}
			
			aiMessage = await this.commandBus.execute(
				new ChatMessageUpsertCommand({
					parent: userMessage,
					role: 'ai',
					content: ``,
					executionId,
					conversationId: conversation.id,
					status: 'thinking'
				})
			)
		}

		// Two-gate runtime metadata
		const runId = this.executionRuntime.generateRunId()
		const sessionKey = this.executionRuntime.sessionKeyResolver.resolveForChat({
			conversationId: conversation.id,
			xpertId,
			userId,
			fromEndUserId
		})
		const disconnectGraceMs = resolveClientDisconnectGraceMs()
		const runUser =
			currentUser && tenantId && !currentUser.tenantId
				? {
						...currentUser,
						tenantId
				  }
				: currentUser
		const runInCapturedRequestContext = <T>(task: () => Promise<T>): Promise<T> => {
			if (!runUser || !organizationId) {
				return task()
			}

			return new Promise<T>((resolve, reject) => {
				runWithRequestContext(
					{
						user: runUser,
						headers: {
							['organization-id']: organizationId,
							...(tenantId ? { ['tenant-id']: tenantId } : {})
						}
					},
					() => {
						task().then(resolve).catch(reject)
					}
				)
			})
		}

		return new Observable<MessageEvent>((subscriber) => {
			// New conversation
			subscriber.next({
				data: {
					type: ChatMessageTypeEnum.EVENT,
					event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
					data: {
						id: conversation.id,
						title: conversation.title || shortTitle(input?.input),
						status: conversation.status,
						createdAt: conversation.createdAt,
						updatedAt: conversation.updatedAt
					}
				}
			} as MessageEvent)

			subscriber.next({
				data: {
					type: ChatMessageTypeEnum.EVENT,
					event: ChatMessageEventTypeEnum.ON_MESSAGE_START,
					data: { ...aiMessage, status: 'thinking' }
				}
			} as MessageEvent);

			const logger = this.#logger
			const reflect = RunnableLambda.from(async (input: TChatRequestHuman) => {
				let status = XpertAgentExecutionStatusEnum.SUCCESS
				let error = null
				let result = ''
				let agentObservable: Observable<MessageEvent> = null

				// Memory Reply
				const memoryReply = latestXpert.features?.memoryReply
				if (memoryReply?.enabled && memoryStore) {
					const items = await memoryStore.search([xpertId, LongTermMemoryTypeEnum.QA], { query: input.input })
					const memoryReplies = items.filter((item) => item.score >= (memoryReply.scoreThreshold ?? 0.8))
					if (memoryReplies.length > 0) {
						// If a memory matched, simulate an AI text message with the answer
						agentObservable = new Observable<MessageEvent>((subscriber) => {
							subscriber.next({
								data: {
									type: ChatMessageTypeEnum.MESSAGE,
									data: memoryReplies[0].value?.answer
								}
							} as MessageEvent)
							subscriber.complete()
						})
					}
				}

				if (!agentObservable) {
					// No memory reply then create agents graph
					agentObservable = await this.commandBus.execute<XpertAgentChatCommand, Promise<Observable<MessageEvent>>>(
						new XpertAgentChatCommand(state, xpert.agent.key, xpert, {
							...(options ?? {}),
							store: memoryStore,
							conversationId: conversation.id,
							isDraft: options?.isDraft,
							execution: { id: executionId, category: 'agent' },
							abortController,
							command,
							memories,
							summarizeTitle: !latestXpert.agentConfig?.summarizeTitle?.disable,
							checkpointId: checkpointId
						})
					)
				}

					let _execution = null
					let operation: TSensitiveOperation = null
					await new Promise<void>((resolve) => {
						let settled = false
						let unsubscribePersistPromise: Promise<void> | null = null
						const finish = () => {
							if (settled) {
								return
							}
							settled = true
							abortController.signal.removeEventListener('abort', abortHandler)
							resolve()
						}
						const abortHandler = () => {
							subscription.unsubscribe()
							if (unsubscribePersistPromise) {
								unsubscribePersistPromise.finally(finish)
							} else {
								finish()
							}
						}

						const subscription = concat(
							agentObservable.pipe(
							tap({
								next: (event) => {
									if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
										appendMessageContent(aiMessage, event.data.data)
										result += messageContentText(event.data.data)
									} else if (
										event.data.type === ChatMessageTypeEnum.EVENT
									) {
										switch(event.data.event) {
											case (ChatMessageEventTypeEnum.ON_AGENT_END): {
												_execution = event.data.data
												break
											}
											case (ChatMessageEventTypeEnum.ON_INTERRUPT): {
												operation = event.data.data
												break
											}
											case (ChatMessageEventTypeEnum.ON_TOOL_MESSAGE): {
												appendMessageSteps(aiMessage, [event.data.data])
												break
											}
											case (ChatMessageEventTypeEnum.ON_CHAT_EVENT): {
												if (event.data.data?.type === 'sandbox') {
													conversation.options ??= {}
													conversation.options.features ??= []
													conversation.options.features.push('sandbox')
													conversation.options.features = uniq(conversation.options.features)
												}
												break
											}
										}
									}
								}
							}),
							catchError((err) => {
								status = XpertAgentExecutionStatusEnum.ERROR
								error = getErrorMessage(err)
								return EMPTY
							})
						),
						// Then do the final async work after the agent stream
						of(true).pipe(
							switchMap(async () => {
								try {
									// Record Execution
									const timeEnd = Date.now()

									const entity = _execution?.status === XpertAgentExecutionStatusEnum.ERROR ||
										status === XpertAgentExecutionStatusEnum.ERROR
											? {
													id: executionId,
													elapsedTime: timeEnd - timeStart,
													status: XpertAgentExecutionStatusEnum.ERROR,
													error: _execution?.error || error,
													outputs: {
														output: result
													}
												}
											: {
													id: executionId,
													elapsedTime: timeEnd - timeStart,
													status,
													outputs: {
														output: result
													}
												}
									await this.commandBus.execute(new XpertAgentExecutionUpsertCommand(entity))

									// Update ai message
									if (_execution?.status === XpertAgentExecutionStatusEnum.ERROR) {
										aiMessage.status = XpertAgentExecutionStatusEnum.ERROR
										aiMessage.error = _execution.error
									} else if (status) {
										aiMessage.status = status
										aiMessage.error = error
									}
									await this.commandBus.execute(new ChatMessageUpsertCommand(aiMessage))

									subscriber.next({
										data: {
											type: ChatMessageTypeEnum.EVENT,
											event: ChatMessageEventTypeEnum.ON_MESSAGE_END,
											data: { ...aiMessage }
										}
									} as MessageEvent)

									// Update conversation
									let convStatus: TChatConversationStatus = 'idle'
									if (_execution?.status === XpertAgentExecutionStatusEnum.ERROR) {
										convStatus = 'error'
									} else if (_execution?.status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
										convStatus = 'interrupted'
									}
									const _conversation = await this.commandBus.execute(
										new ChatConversationUpsertCommand({
											id: conversation.id,
											status: convStatus,
											title: conversation.title || _execution?.title || shortTitle(input?.input),
											operation,
											error: _execution?.error,
											options: conversation.options,
										})
									)

									// Schedule summary job
									if (memory?.enabled && memory.profile?.enabled && convStatus === 'idle') {
										await this.commandBus.execute(
											new ScheduleSummaryJobCommand(conversation.id, userId, memory)
										)
									}

									return {
										data: {
											type: ChatMessageTypeEnum.EVENT,
											event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
											data: {
												id: _conversation.id,
												title: _conversation.title,
												status: _conversation.status,
												operation: _conversation.operation,
												error: _conversation.error
											}
										}
									} as MessageEvent
								} catch (err) {
									this.#logger.warn(err)
									subscriber.error(err)
								}
							})
						)
					)
						.pipe(
							tap({
								/**
								 * This function is triggered when the stream is unsubscribed
								 */
								unsubscribe: () => {
									this.#logger.debug(`Canceled by client!`)
									const abortReason = 'Aborted by client disconnect'
									status = XpertAgentExecutionStatusEnum.INTERRUPTED
									error = abortReason
									unsubscribePersistPromise = runInCapturedRequestContext(async () => {
										// Record Execution
										const timeEnd = Date.now()

										await this.commandBus.execute(
											new XpertAgentExecutionUpsertCommand({
												id: executionId,
												elapsedTime: timeEnd - timeStart,
												status: XpertAgentExecutionStatusEnum.INTERRUPTED,
												error: abortReason,
												outputs: {
													output: result
												}
											})
										)

										await this.commandBus.execute(
											new ChatMessageUpsertCommand({
												...aiMessage,
												status: XpertAgentExecutionStatusEnum.INTERRUPTED,
												error: abortReason
											})
										)

										await this.commandBus.execute(
											new ChatConversationUpsertCommand({
												id: conversation.id,
												status: 'interrupted',
												title: conversation.title || _execution?.title || shortTitle(input?.input),
												error: abortReason,
												options: conversation.options
											})
										)
									})
										.catch((err) => {
											this.#logger.error(err)
										})
										.then(() => undefined)
								}
							})
						)
						.subscribe({
						next: (event) => {
							subscriber.next(event)
						},
						error: (err) => {
							if (!subscriber.closed) {
								subscriber.error(err)
							}
							finish()
						},
						complete: () => {
							if (!subscriber.closed) {
								subscriber.complete()
							}
							finish()
						}
					})

					abortController.signal.addEventListener('abort', abortHandler, { once: true })
				})
			})
				void enqueueLocalTaskAndWait(
					this.localQueueTaskService,
					this.handoffQueue,
					{
						id: runId,
						tenantId,
						organizationId,
						userId,
						user: runUser,
						sessionKey,
						conversationId: conversation.id,
						executionId,
					source: 'xpert',
					requestedLane: 'main',
					task: async ({ signal }) => {
						const onAbort = () => {
							if (!abortController.signal.aborted) {
								abortController.abort(signal.reason)
							}
						}

						if (signal.aborted) {
							onAbort()
						} else {
							signal.addEventListener('abort', onAbort, { once: true })
						}

						try {
							await reflect.invoke(input, {
								callbacks: [
									{
										handleCustomEvent(eventName, data, runId) {
											if (eventName === ChatMessageEventTypeEnum.ON_CHAT_EVENT) {
												logger.debug(`========= handle custom event in xpert:`, eventName, runId)
												subscriber.next({
													data: {
														type: ChatMessageTypeEnum.EVENT,
														event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
														data
													}
												} as MessageEvent)
											} else {
												logger.warn(`Unprocessed custom event in xpert:`, eventName, runId)
											}
										},
									},
								],
							})
						} finally {
							signal.removeEventListener('abort', onAbort)
						}
					}
				}
			)
				.catch((err) => {
					this.#logger.error(err)
					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.EVENT,
							event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
							data: {
								id: conversation.id,
								status: 'error',
								error: getErrorMessage(err)
							}
						}
					} as MessageEvent)
					subscriber.error(err)
				})

				// It will be triggered when the subscription ends normally or is unsubscribed.
					return () => {
						abortRunAfterDisconnectGrace({
							executionQueue: this.executionRuntime,
							runId,
							abortController,
							graceMs: disconnectGraceMs
						})
				}
			})
		}
	}

async function getLongTermMemory(store: BaseStore, xpertId: string, input: string) {
	return await store?.search([xpertId, LongTermMemoryTypeEnum.PROFILE], { query: input })
}
