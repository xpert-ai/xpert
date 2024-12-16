import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { IXpertAgent } from '@metad/contracts'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { FindAgentExecutionsQuery, XpertAgentExecutionStateQuery } from '../../../xpert-agent-execution/queries'
import { createReactAgent } from '../../../xpert-agent/commands/handlers/react_agent_executor'
import { AgentStateAnnotation } from '../../../xpert-agent/commands/handlers/types'
import { GetXpertAgentQuery, GetXpertChatModelQuery } from '../../queries'
import { XpertService } from '../../xpert.service'
import { XpertSummarizeMemoryCommand } from '../summarize-memory.command'

@CommandHandler(XpertSummarizeMemoryCommand)
export class XpertSummarizeMemoryHandler implements ICommandHandler<XpertSummarizeMemoryCommand> {
	readonly #logger = new Logger(XpertSummarizeMemoryHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertSummarizeMemoryCommand) {
		const { id, executionId } = command
		const xpert = await this.xpertService.findOne(id, { relations: ['agent'] })

		const { tenantId, organizationId } = xpert

		const { items } = await this.queryBus.execute(
			new FindAgentExecutionsQuery({
				where: {
					tenantId,
					organizationId,
					id: executionId
				}
			})
		)

		const summarizedExecution = items[0]
		if (!summarizedExecution) {
			throw new NotFoundException(`Not found execution of id '${executionId}'`)
		}

		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpert.id, xpert.agent.key, command.options?.isDraft)
		)
		if (!agent) {
			throw new NotFoundException(
				`Xpert agent not found for '${xpert.name}' and key ${xpert.agent.key} draft is ${command.options?.isDraft}`
			)
		}

		const summarizedState = await this.queryBus.execute<
			XpertAgentExecutionStateQuery,
			typeof AgentStateAnnotation.State
		>(new XpertAgentExecutionStateQuery(executionId))

		const execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				xpertId: xpert.id
			})
		)

		const abortController = new AbortController()
		const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
			new GetXpertChatModelQuery(agent.team, agent, {
				abortController,
				tokenCallback: (token) => {
					execution.tokens += token ?? 0
				}
			})
		)

		const thread_id = execution.threadId

		const graph = createReactAgent({
			tags: [thread_id],
			llm: chatModel,
			checkpointSaver: this.copilotCheckpointSaver,
			stateModifier: async (state: typeof AgentStateAnnotation.State) => {
				const { summary, messages } = summarizedState
				let systemTemplate = `${agent.prompt}`
				if (summary) {
					systemTemplate += `\nSummary of conversation earlier: \n${summary}`
				}
				const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
					templateFormat: 'mustache'
				}).format({ ...summarizedState })

				console.log([systemMessage, ...messages])

				return [systemMessage, ...messages, ...state.messages]
			}
		})
		const config = {
			thread_id,
			checkpoint_ns: ''
		}

		const memory = agent.team.memory

		const response = await graph.invoke(
			{
				messages: [
					new HumanMessage(
						memory?.prompt ||
							`用叙述式语气简短一句话总结以上对话的经验，我们将存储至长期记忆中，以便下次能更好地理解和回答用户用户`
					)
				]
			},
			{
				configurable: config
			}
		)

		const lastMessage = response.messages[response.messages.length - 1]

		console.log(lastMessage)

		return lastMessage.content
	}
}
