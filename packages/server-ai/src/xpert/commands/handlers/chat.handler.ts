import { MessageContent } from '@langchain/core/messages'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, CopilotChatMessage, IChatConversation, IXpert, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { getErrorMessage, shortuuid } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Observable, tap } from 'rxjs'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands'
import { XpertService } from '../../xpert.service'
import { XpertChatCommand } from '../chat.command'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/index'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/index'
import {
	XpertAgentExecutionUpsertCommand
} from '../../../xpert-agent-execution/commands'

@CommandHandler(XpertChatCommand)
export class XpertChatHandler implements ICommandHandler<XpertChatCommand> {
	readonly #logger = new Logger(XpertChatHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertChatCommand): Promise<Observable<MessageEvent>> {
		const { options } = command
		const { xpertId, input, conversationId } = command.request

		const timeStart = Date.now()

		const xpert = await this.xpertService.findOne(xpertId, { relations: ['agent'] })

		const userMessage: CopilotChatMessage = {
			id: shortuuid(),
			role: 'human',
			content: input.input,
		}
		let conversation: IChatConversation
		if (conversationId) {
			conversation = await this.queryBus.execute(
				new GetChatConversationQuery({id: conversationId}, [])
			)
			conversation.messages ??= []
			conversation.messages.push(userMessage)
			await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					id: conversation.id,
					messages: conversation.messages
				})
			)
		} else {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					xpert,
					// threadId,
					title: input.input, // 改成 AI 自动总结标题
					options: {
						knowledgebases: options?.knowledgebases,
						toolsets: options?.toolsets
					},
					messages: [userMessage],
				})
			)
		}

		const execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				xpert: { id: xpert.id } as IXpert,
				agentKey: xpert.agent.key,
				inputs: input,
				status: XpertAgentExecutionStatusEnum.RUNNING,
				threadId: conversation.threadId
			})
		)

		const aiMessage: CopilotChatMessage = {
			id: shortuuid(),
			role: 'ai',
			content: ``,
			executionId: execution.id
		}

		let status = XpertAgentExecutionStatusEnum.SUCCESS
		let error = null
		let result = ''

		const agentObservable = await this.commandBus.execute<XpertAgentChatCommand, Promise<Observable<MessageEvent>>>(
			new XpertAgentChatCommand(input, xpert.agent.key, xpert, {
				...(options ?? {}),
				isDraft: options?.isDraft,
				execution
			})
		)

		return new Observable<MessageEvent>((subscriber) => {
			// New conversation
			subscriber.next({
				data: {
					type: ChatMessageTypeEnum.EVENT,
					event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
					data: {
						id: conversation.id,
						title: conversation.title,
						createdAt: conversation.createdAt,
						updatedAt: conversation.updatedAt,
					}
				}
			} as MessageEvent)

			agentObservable.pipe(
				tap({
					next: (event) => {
						if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
							appendMessageContent(aiMessage, event.data.data)
							if (typeof event.data.data === 'string') {
							  result += event.data.data
							}
						}
					},
					error: (err) => {
						status = XpertAgentExecutionStatusEnum.ERROR
						error = getErrorMessage(err)
					},
					finalize: async () => {
						try {
							const timeEnd = Date.now()
							// Record End time
							const entity = status === XpertAgentExecutionStatusEnum.ERROR ? {
								id: execution.id,
								elapsedTime: timeEnd - timeStart,
								status,
								error,
								outputs: {
									output: result
								}
							} : {
								id: execution.id,
								elapsedTime: timeEnd - timeStart,
								outputs: {
									output: result
								}
							}
							const _execution = await this.commandBus.execute(new XpertAgentExecutionUpsertCommand(entity))
	
							// Update ai message
							aiMessage.status = _execution.status
							await this.commandBus.execute(
								new ChatConversationUpsertCommand({
									...conversation,
									messages: [
										...conversation.messages,
										aiMessage
									],
								})
							)
						} catch (err) {
							//
						}
					}
				})
			).subscribe(subscriber)

			return () => {
				//
			}
		})
	}
}

export function appendMessageContent(aiMessage: CopilotChatMessage, content: MessageContent) {
	const _content = aiMessage.content
	if (typeof content === 'string') {
		if (typeof _content === 'string') {
			aiMessage.content = _content + content
		} else if (Array.isArray(_content)) {
			const lastContent = _content[_content.length - 1]
			if (lastContent.type === 'text') {
				lastContent.text = lastContent.text + content
			} else {
				_content.push({
					type: 'text',
					text: content
				})
			}
		} else {
			aiMessage.content = content
		}
	} else {
		if (Array.isArray(_content)) {
			_content.push(content)
		} else if(_content) {
			aiMessage.content = [
				{
					type: 'text',
					text: _content
				},
				content
			]
		} else {
			aiMessage.content = [
				content
			]
		}
	}
}