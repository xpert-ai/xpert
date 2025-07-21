import { NodeInterrupt } from '@langchain/langgraph'
import { RunnableLambda } from '@langchain/core/runnables'
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	IXpert,
	mapTranslationLanguage,
	messageContentText,
	TChatRequestHuman,
	TMessageContentComplex,
	TSensitiveOperation,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { I18nService } from 'nestjs-i18n'
import { catchError, concat, EMPTY, map, Observable, of, Subject, switchMap, takeUntil, tap } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { XpertAgentChatCommand } from '../chat.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentExecutionDTO } from '../../../xpert-agent-execution/dto'

@CommandHandler(XpertAgentChatCommand)
export class XpertAgentChatHandler implements ICommandHandler<XpertAgentChatCommand> {
	readonly #logger = new Logger(XpertAgentChatHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService,
	) {}

	public async execute(command: XpertAgentChatCommand): Promise<Observable<MessageEvent>> {
		const { input, xpert, agentKey, options } = command
		// eslint-disable-next-line @typescript-eslint/no-unused-vars, prefer-const
		let { language, execution, memories } = options
		const timeStart = Date.now()
		
		execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				id: execution?.id,
				xpert: { id: xpert.id } as IXpert,
				agentKey,
				inputs: input,
				status: XpertAgentExecutionStatusEnum.RUNNING,
				// title: input.input
			})
		)

		// i18n prepare
		const i18nError = await this.i18nService.t('xpert.Error', {lang: mapTranslationLanguage(language)})

		const thread_id = execution.threadId
		let operation: TSensitiveOperation = null
		return new Observable<MessageEvent>((subscriber) => {
			// Start execution event
			subscriber.next({
				data: {
					type: ChatMessageTypeEnum.EVENT,
					event: ChatMessageEventTypeEnum.ON_AGENT_START,
					data: execution
				}
			} as MessageEvent)

			const destroy$ = new Subject<void>()
			const logger = this.#logger
			RunnableLambda.from(async (input: TChatRequestHuman) => {
				let status = XpertAgentExecutionStatusEnum.SUCCESS
				let error = null
				let result = ''
				const agentStream = await this.commandBus.execute<XpertAgentInvokeCommand, Observable<string | TMessageContentComplex>>(
							new XpertAgentInvokeCommand(input, agentKey, xpert, {
								...(options ?? {}),
								rootExecutionId: execution.id,
								thread_id,
								execution,
								subscriber,
								memories
							})
						)
				concat(
					agentStream.pipe(
						map((messageContent: string | TMessageContentComplex) => {
							result += messageContentText(messageContent)
							return {
								data: {
									type: ChatMessageTypeEnum.MESSAGE,
									data: messageContent
								}
							} as MessageEvent
						}),
						catchError((err) => {
							if (err instanceof NodeInterrupt) {
								status = XpertAgentExecutionStatusEnum.INTERRUPTED
								error = null
							} else {
								console.error(err)
								status = XpertAgentExecutionStatusEnum.ERROR
								error = getErrorMessage(err)
							}
							return EMPTY
						})
					),
					// Then do the final async work after the agent stream
					of(true).pipe(
						switchMap(async () => {
							try {
								const timeEnd = Date.now()

								// Record End time
								await this.commandBus.execute(
									new XpertAgentExecutionUpsertCommand({
										...execution,
										elapsedTime: Number(execution.elapsedTime ?? 0) + (timeEnd - timeStart),
										status,
										error,
										outputs: {
											output: result
										},
										operation
									})
								)

								const fullExecution = instanceToPlain(new XpertAgentExecutionDTO(await this.queryBus.execute(
									new XpertAgentExecutionOneQuery(execution.id)
								)))

								this.#logger.verbose(fullExecution)

								return {
									data: {
										type: ChatMessageTypeEnum.EVENT,
										event: ChatMessageEventTypeEnum.ON_AGENT_END,
										data: fullExecution
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
							unsubscribe: async () => {
								this.#logger.debug(`Canceled by client!`)
								
								try {
									const timeEnd = Date.now()
		
									// Record End time
									await this.commandBus.execute(
										new XpertAgentExecutionUpsertCommand({
											...omit(execution, 'checkpointId'),
											elapsedTime: Number(execution.elapsedTime ?? 0) + (timeEnd - timeStart),
											status: XpertAgentExecutionStatusEnum.ERROR,
											error: 'Aborted!',
											outputs: {
												output: result
											},
										})
									)
								} catch(err) {
									this.#logger.error(err)
								}
							}
						}),
						takeUntil(destroy$))
					.subscribe({
						next: (event) => {
							subscriber.next(event)
						},
						error: () => {
							/**
							 * The empty error method is used to catch exceptions and cannot be removed.
							 * The error handling logic is placed in the `finalize` method
							 */
						},
						complete: () => {
							subscriber.complete()
						}
					})
				}).invoke(input, {
					callbacks: [
						{
							handleCustomEvent(eventName, data, runId) {
								if (eventName === ChatMessageEventTypeEnum.ON_CHAT_EVENT) {
									logger.debug(`========= handle custom event in project:`, eventName, runId)
									subscriber.next({
										data: {
											type: ChatMessageTypeEnum.EVENT,
											event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
											data: data
										}
									} as MessageEvent)
								} else {
									logger.warn(`Unprocessed custom event in project:`, eventName, runId)
								}
							},
						},
					],
				}).catch((err) => {
					console.error(err)
                    subscriber.next({
                            data: {
                                type: ChatMessageTypeEnum.EVENT,
                                event: ChatMessageEventTypeEnum.ON_AGENT_END,
                                data: {
                                    id: execution.id,
                                    agentKey: execution.agentKey,
                                    status: XpertAgentExecutionStatusEnum.ERROR,
                                    error: getErrorMessage(err),
                                }
                            }
                        } as MessageEvent)
                    subscriber.error(err)
				})

			// When this TeardownLogic is called, the subscriber is already in the 'closed' state.
			return () => {
				destroy$.next()
			}
		}).pipe(
			tap((event) => {
				if (
					event.data.type === ChatMessageTypeEnum.EVENT &&
					event.data.event === ChatMessageEventTypeEnum.ON_INTERRUPT
				) {
					operation = event.data.data
				}
			})
		)
	}
}
