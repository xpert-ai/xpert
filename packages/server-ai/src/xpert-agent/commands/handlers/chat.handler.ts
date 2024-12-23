import { MessageContent } from '@langchain/core/messages'
import { NodeInterrupt } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	IXpert,
	TSensitiveOperation,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { catchError, concat, EMPTY, from, map, Observable, of, Subject, switchMap, takeUntil, tap } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { XpertAgentChatCommand } from '../chat.command'
import { XpertAgentExecuteCommand } from '../execute.command'

@CommandHandler(XpertAgentChatCommand)
export class XpertAgentChatHandler implements ICommandHandler<XpertAgentChatCommand> {
	readonly #logger = new Logger(XpertAgentChatHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentChatCommand): Promise<Observable<MessageEvent>> {
		const { input, xpert, agentKey, options } = command
		// eslint-disable-next-line @typescript-eslint/no-unused-vars, prefer-const
		let { execution, memories } = options
		execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				id: execution?.id,
				xpert: { id: xpert.id } as IXpert,
				agentKey,
				inputs: input,
				status: XpertAgentExecutionStatusEnum.RUNNING,
				title: input.input
			})
		)

		const timeStart = Date.now()

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
			let status = XpertAgentExecutionStatusEnum.SUCCESS
			let error = null
			let result = ''

			concat(
				from(
					this.commandBus.execute<XpertAgentExecuteCommand, Observable<MessageContent>>(
						new XpertAgentExecuteCommand(input, agentKey, xpert, {
							...(options ?? {}),
							isDraft: true,
							rootExecutionId: execution.id,
							thread_id,
							execution,
							subscriber,
							memories
						})
					)
				).pipe(
					switchMap((output) => output),
					map((messageContent: MessageContent) => {
						result += messageContent
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
							status = XpertAgentExecutionStatusEnum.ERROR
							error = getErrorMessage(err)
						}
						return EMPTY
					})
				),
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

							const fullExecution = await this.queryBus.execute(
								new XpertAgentExecutionOneQuery(execution.id)
							)

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
				.pipe(takeUntil(destroy$))
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
