import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { BaseStore } from '@langchain/langgraph'
import { channelName, IXpert, IXpertAgent, LongTermMemoryTypeEnum, MEMORY_PROFILE_PROMPT, MEMORY_QA_PROMPT, TLongTermMemoryConfig } from '@metad/contracts'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { v4 as uuidv4 } from 'uuid'
import z from 'zod'
import { CreateCopilotStoreCommand } from '../../../copilot-store'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { XpertAgentExecutionStateQuery } from '../../../xpert-agent-execution/queries'
import { AgentStateAnnotation } from '../../../xpert-agent/commands/handlers/types'
import { GetXpertAgentQuery, GetXpertChatModelQuery, GetXpertMemoryEmbeddingsQuery } from '../../queries'
import { XpertService } from '../../xpert.service'
import { XpertSummarizeMemoryCommand } from '../summarize-memory.command'
import { memoryPrompt } from '../../../copilot-store/utils'

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
		const { types, userId } = command.options
		const xpert = await this.xpertService.findOne(id, { relations: ['agent'] })

		const { tenantId, organizationId } = xpert

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

		// Create a new execution (Run) for this chat
		const execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				xpertId: xpert.id
			})
		)

		const abortController = new AbortController()
		const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
			new GetXpertChatModelQuery(agent.team, agent, {
				abortController,
				usageCallback: assignExecutionUsage(execution),
			})
		)

		const embeddings = await this.queryBus.execute(
			new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {
				tokenCallback: (token) => {
					execution.embedTokens += token ?? 0
				}
			})
		)

		const memoryKey = []
		if (types.includes(LongTermMemoryTypeEnum.QA)) {
			const keys = await this.summarize(xpert, LongTermMemoryTypeEnum.QA, memory.qa, {
				chatModel,
				embeddings,
				userId,
				summarizedState,
				agent
			})

			memoryKey.push(...(Array.isArray(keys) ? keys : [keys]))
		}

		if (types.includes(LongTermMemoryTypeEnum.PROFILE)) {
			const keys = await this.summarize(xpert, LongTermMemoryTypeEnum.PROFILE, memory.profile, {
				chatModel,
				embeddings,
				userId,
				summarizedState,
				agent
			})

			memoryKey.push(...(Array.isArray(keys) ? keys : [keys]))
		}

		await this.commandBus.execute(new XpertAgentExecutionUpsertCommand(execution))

		return memoryKey
	}

	async summarize(
		xpert: IXpert,
		type: LongTermMemoryTypeEnum,
		memory: TLongTermMemoryConfig,
		options: {
			chatModel: BaseChatModel
			embeddings: Embeddings
			userId: string
			summarizedState: typeof AgentStateAnnotation.State
			agent: IXpertAgent
		}
	) {
		const { tenantId, organizationId } = xpert
		const { chatModel, embeddings, userId, summarizedState, agent } = options
		const channel = channelName(agent.key)

		let schema = null
		const fields = []
		if (type === LongTermMemoryTypeEnum.QA) {
			fields.push('input')
		} else if (type === LongTermMemoryTypeEnum.PROFILE) {
			fields.push('profile')
		} else {
			// fields.push('customs')
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

		const { summary, messages } = summarizedState[channel]
		let systemTemplate = `${agent.prompt}`
		if (summary) {
			systemTemplate += `\nSummary of conversation earlier: \n${summary}`
		}
		const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
			templateFormat: 'mustache'
		}).format({ ...summarizedState })

		const items = await store.search([xpert.id, type])

		let prompt = memory.prompt
		if (type === LongTermMemoryTypeEnum.QA) {
			schema = z.object({
				input: z.string().describe(`The user's input question`),
				output: z.string().describe(`The ai's output answer`)
			})

			if (!prompt) {
				prompt = MEMORY_QA_PROMPT
			}
		} else {
			// Default profile LongTermMemoryTypeEnum.PROFILE
			schema = z.object({
				profile: z.string().optional().describe(`The user's profile`),
			})

			if (!prompt) {
				prompt = MEMORY_PROFILE_PROMPT
			}
		}

		prompt += `\nThe following are existing memories:\n<memory>\n${memoryPrompt(items)}\n</memory>`

		const experiences = await chatModel
			.withStructuredOutput(schema)
			.invoke([systemMessage, ...messages, new HumanMessage(prompt)])

		const namespace = [xpert.id, type]
		let memoryKey = null
		if (Array.isArray(experiences)) {
			memoryKey = []
			const operations = experiences.map((experience) => {
				const key = uuidv4()
				memoryKey.push(key)
				return {
					namespace,
					key,
					value: experience
				}
			})
			await store.batch(operations)
		} else if (experiences) {
			const query = experiences?.profile || experiences?.input
			if (query) {
				// Remove the top 1 record that are too similar
				const exists = await store.search(namespace, {query})
				if (exists[0] && exists[0].score > 0.9) {
					await store.delete(namespace, exists[0].key)
					this.#logger.debug(`Removed top 1 similar memory: ${exists[0]}`,)
				}

				// Record new memeory
				memoryKey = uuidv4()
				await store.put(namespace, memoryKey, experiences)
				this.#logger.debug(`Add a memory: ${JSON.stringify(experiences, null, 2)}`,)
			}
		}

		return memoryKey
	}
}
