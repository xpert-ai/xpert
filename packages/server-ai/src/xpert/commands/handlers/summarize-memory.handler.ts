import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { BaseStore } from '@langchain/langgraph'
import { IXpertAgent, LongTermMemoryTypeEnum } from '@metad/contracts'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { v4 as uuidv4 } from 'uuid'
import z from 'zod'
import { CreateCopilotStoreCommand } from '../../../copilot-store'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { FindAgentExecutionsQuery, XpertAgentExecutionStateQuery } from '../../../xpert-agent-execution/queries'
import { AgentStateAnnotation } from '../../../xpert-agent/commands/handlers/types'
import { GetXpertAgentQuery, GetXpertChatModelQuery, GetXpertMemoryEmbeddingsQuery } from '../../queries'
import { XpertService } from '../../xpert.service'
import { XpertSummarizeMemoryCommand } from '../summarize-memory.command'

@CommandHandler(XpertSummarizeMemoryCommand)
export class XpertSummarizeMemoryHandler implements ICommandHandler<XpertSummarizeMemoryCommand> {
	readonly #logger = new Logger(XpertSummarizeMemoryHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertSummarizeMemoryCommand) {
		const { id, executionId } = command
		const { userId } = command.options
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

		const memory = agent.team.memory

		if (!memory?.enabled) {
			return
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

		const embeddings = await this.queryBus.execute(
			new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {
				tokenCallback: (token) => {
					execution.embedTokens += token ?? 0
				}
			})
		)

		const { summary, messages } = summarizedState
		let systemTemplate = `${agent.prompt}`
		if (summary) {
			systemTemplate += `\nSummary of conversation earlier: \n${summary}`
		}
		const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
			templateFormat: 'mustache'
		}).format({ ...summarizedState })

		let prompt = memory.prompt
		let schema = null
		const fields = []
		if (memory.type === LongTermMemoryTypeEnum.QA) {
			schema = z.object({
				input: z.string().describe(`The user's input question`),
				output: z.string().describe(`The ai's output answer`)
			})
			if (!prompt) {
				prompt = `Summarize the experience of the above conversation and output a short question and answer`
			}
			fields.push('input')
		} else {
			// Default profile LongTermMemoryTypeEnum.PROFILE
			schema = z.object({
				profile: z.string().describe(`The user's profile`)
			})
			if (!prompt) {
				prompt = `Summarize the conclusion of the above conversation in a short sentence with a factual tone, which we will store in long-term memory`
			}
			fields.push('profile')
		}

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

		const experiences = await chatModel
			.withStructuredOutput(schema)
			.invoke([systemMessage, ...messages, new HumanMessage(prompt)])

		let memoryKey = null
		if (Array.isArray(experiences)) {
			memoryKey = []
			const operations = experiences.map((experience) => {
				const key = uuidv4()
				memoryKey.push(key)
				return {
					namespace: [xpert.id,],
					key,
					value: experience
				}
			})
			await store.batch(operations)
		} else if (experiences) {
			memoryKey = uuidv4()
			await store.put([xpert.id,], memoryKey, experiences)
		}

		await this.commandBus.execute(new XpertAgentExecutionUpsertCommand(execution))

		return memoryKey
	}
}
