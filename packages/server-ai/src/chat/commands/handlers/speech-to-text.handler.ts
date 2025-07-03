import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { RequestContext } from '@metad/server-core'
import { InternalServerErrorException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { CopilotGetOneQuery } from '../../../copilot'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { FindXpertQuery } from '../../../xpert'
import { SpeechToTextCommand } from '../speed-to-text.command'

@CommandHandler(SpeechToTextCommand)
export class SpeechToTextHandler implements ICommandHandler<SpeechToTextCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: SpeechToTextCommand) {
		const { xpertId, isDraft } = command.options
		const { file } = command

		const xpert = await this.queryBus.execute(new FindXpertQuery({ id: xpertId }, { isDraft }))

		const copilotModel = xpert.features?.speechToText?.copilotModel
		const copilotId = copilotModel?.copilotId
		const copilot = await this.queryBus.execute(
			new CopilotGetOneQuery(RequestContext.currentTenantId(), copilotId, ['copilotModel'])
		)

		const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(copilot, copilotModel, {
				abortController: new AbortController(),
				usageCallback: null
			})
		)

		try {
			const message = await chatModel.invoke([
				new HumanMessage({
					content: [
						{
							url: file.url
						}
					]
				})
			])

			if (Array.isArray(message.content)) {
				return {
					text: message.content.join('\n')
				}
			}

			return {
				text: message.content
			}
		} catch (error) {
			throw new InternalServerErrorException(error)
		}
	}
}
