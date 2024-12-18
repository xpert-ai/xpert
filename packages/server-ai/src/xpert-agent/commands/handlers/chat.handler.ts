import { MessageContent } from '@langchain/core/messages'
import { BaseStore, NodeInterrupt } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	IXpert,
	LongTermMemoryTypeEnum,
	TSensitiveOperation,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { catchError, concat, EMPTY, from, map, Observable, of, Subject, switchMap, takeUntil, tap } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { XpertAgentChatCommand } from '../chat.command'
import { XpertAgentExecuteCommand } from '../execute.command'
import { GetXpertMemoryEmbeddingsQuery } from '../../../xpert/queries'
import { CreateCopilotStoreCommand } from '../../../copilot-store'

@CommandHandler(XpertAgentChatCommand)
export class XpertAgentChatHandler implements ICommandHandler<XpertAgentChatCommand> {
	readonly #logger = new Logger(XpertAgentChatHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentChatCommand): Promise<Observable<MessageEvent>> {
		const { input, xpert, agentKey, options } = command
		let { execution } = options
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

		// Long-term memory
		const memory = await this.getLongTermMemory(options.isDraft ? xpert.draft?.team : xpert, RequestContext.currentUserId())
		console.log(memory)

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
							memory
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
							console.log(err)
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

	async getLongTermMemory(xpert: Partial<IXpert>, userId: string) {
		const { tenantId, organizationId } = xpert
		const memory = xpert.memory
		if (!memory?.enabled) {
			return null
		}

		const fields = []
		if (memory.type === LongTermMemoryTypeEnum.QA) {
			fields.push('input')
		} else {
			fields.push('profile')
		}

		const embeddings = await this.queryBus.execute(new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {} ))

		const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
			new CreateCopilotStoreCommand({
				tenantId,
				organizationId,
				userId,
				index: {
					dims: null,
					embeddings,
					fields
				}
			})
		)

		return await store.search([xpert.id])
	}
}
