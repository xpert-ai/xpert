import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { RunnableConfig } from '@langchain/core/runnables'
import {
	GRAPH_NODE_TITLE_CONVERSATION,
	IXpert,
	mapTranslationLanguage,
	STATE_VARIABLE_SYS,
	TMessageChannel,
	TXpertAgentExecution,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { v4 as uuidv4 } from 'uuid'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { XpertCopilotNotFoundException } from '../../../core/errors'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { GetXpertChatModelQuery } from '../../../xpert/queries'
import { CreateSummarizeTitleAgentCommand } from '../summarize-title.command'
import { AgentStateAnnotation, STATE_VARIABLE_TITLE_CHANNEL } from './types'


@CommandHandler(CreateSummarizeTitleAgentCommand)
export class CreateSummarizeTitleAgentHandler implements ICommandHandler<CreateSummarizeTitleAgentCommand> {
	readonly #logger = new Logger(CreateSummarizeTitleAgentHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateSummarizeTitleAgentCommand) {
		const { xpert, copilot, rootController, rootExecutionId, channel } = command.options

		// Record execution
		const execution = {} as TXpertAgentExecution
		let chatModel: BaseChatModel
		if (xpert) {
			const copilotModel = xpert.copilotModel
			if (!copilotModel) {
				throw new XpertCopilotNotFoundException(
					await this.i18nService.t('xpert.Error.XpertCopilotNotFound', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					})
				)
			}
			execution.metadata = {
				provider: copilotModel.copilot.modelProvider?.providerName,
				model: copilotModel.model || copilotModel.copilot.copilotModel?.model
			}
			chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
				new GetXpertChatModelQuery(xpert, null, {
					copilotModel: copilotModel,
					abortController: rootController,
					usageCallback: assignExecutionUsage(execution)
				})
			)
		} else if (copilot) {
			chatModel = await this.queryBus.execute(
				new CopilotModelGetChatModelQuery(copilot, null, {
					abortController: rootController,
					usageCallback: assignExecutionUsage(execution)
				})
			)
		}

		return async (
			state: typeof AgentStateAnnotation.State,
			config: RunnableConfig
		): Promise<Partial<typeof AgentStateAnnotation.State>> => {
			// Record start time
			const timeStart = Date.now()
			let status = XpertAgentExecutionStatusEnum.SUCCESS
			let error = null
			let result = null
			const _execution = await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...execution,
					// xpert: xpert ? { id: xpert.id } as IXpert : null,
					threadId: config.configurable.thread_id,
					checkpointId: config.configurable.checkpoint_id,
					checkpointNs: '',
					parentId: rootExecutionId,
					status: XpertAgentExecutionStatusEnum.RUNNING,
					channelName: STATE_VARIABLE_TITLE_CHANNEL,
					title: await this.i18nService.t('xpert.Agent.SummarizeTitle', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					})
				})
			)

			try {
				// Title the conversation
				const messages = channel ? (<TMessageChannel>state[channel])?.messages : state.messages
				const language = state[STATE_VARIABLE_SYS]?.language

				if (!messages?.length) {
					return {
						title: '',
						[STATE_VARIABLE_TITLE_CHANNEL]: {
							messages: []
						}
					}
				}

				const allMessages = [
					...messages,
					new HumanMessage({
						id: uuidv4(),
						content: xpert?.agentConfig?.summarizeTitle?.instruction || `Create a short title${language ? ` in language '${language}'` : ''} for the conversation above, without adding any extra phrases like 'Conversation Title:':`
					})
				]
				const response = await chatModel.invoke(allMessages, { tags: [GRAPH_NODE_TITLE_CONVERSATION] })
				result = response.content
				if (typeof response.content !== 'string') {
					throw new Error('Expected a string response from the model')
				}

				return {
					title: response.content.replace(/^"/g, '').replace(/"$/g, ''),
					[STATE_VARIABLE_TITLE_CHANNEL]: {
						messages: [...allMessages, response]
					}
				}
			} catch (err) {
				error = getErrorMessage(err)
				status = XpertAgentExecutionStatusEnum.ERROR
			} finally {
				const timeEnd = Date.now()
				// Record End time
				await this.commandBus.execute(
					new XpertAgentExecutionUpsertCommand({
						...execution,
						id: _execution.id,
						elapsedTime: timeEnd - timeStart,
						status,
						error,
						outputs: {
							output: result
						}
					})
				)
			}
		}
	}
}
