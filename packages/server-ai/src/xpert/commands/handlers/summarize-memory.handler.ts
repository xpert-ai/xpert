import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { BaseStore } from '@langchain/langgraph'
import {
	channelName,
	IXpert,
	IXpertAgent,
	LongTermMemoryTypeEnum,
	MEMORY_PROFILE_PROMPT,
	MEMORY_QA_PROMPT,
	TLongTermMemoryConfig,
	TMemory,
	TMessageChannel
} from '@metad/contracts'
import { omit } from '@metad/server-common'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { v4 as uuidv4 } from 'uuid'
import z from 'zod'
import { CreateCopilotStoreCommand, formatMemories } from '../../../copilot-store'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { XpertAgentExecutionStateQuery } from '../../../xpert-agent-execution/queries'
import { GetXpertAgentQuery, GetXpertChatModelQuery, GetXpertMemoryEmbeddingsQuery } from '../../queries'
import { XpertService } from '../../xpert.service'
import { XpertSummarizeMemoryCommand } from '../summarize-memory.command'
import { AgentStateAnnotation, ToolSchemaParser } from '../../../shared'

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

		// Primary agent
		const primaryAgent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpert.id, xpert.agent.key, command.options?.isDraft)
		)
		if (!primaryAgent) {
			throw new NotFoundException(
				`Xpert agent not found for '${xpert.name}' and key ${xpert.agent.key} draft is ${command.options?.isDraft}`
			)
		}

		const memory = primaryAgent.team.memory

		if (!memory?.enabled) {
			return
		}

		const summarizedState = await this.queryBus.execute<
			XpertAgentExecutionStateQuery,
			typeof AgentStateAnnotation.State
		>(new XpertAgentExecutionStateQuery(executionId))

		if (!summarizedState) {
			return
		}

		// Create a new execution (Run) for this chat
		const execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				xpertId: xpert.id
			})
		)

		const abortController = new AbortController()
		const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
			new GetXpertChatModelQuery(primaryAgent.team, primaryAgent, {
				abortController,
				usageCallback: assignExecutionUsage(execution)
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
		if (types.includes(LongTermMemoryTypeEnum.QA) && memory.qa?.enabled) {
			const keys = await this.summarize(xpert, LongTermMemoryTypeEnum.QA, memory.qa, {
				chatModel,
				embeddings,
				userId,
				summarizedState,
				agent: primaryAgent
			})

			memoryKey.push(...(Array.isArray(keys) ? keys : [keys]))
		}

		if (types.includes(LongTermMemoryTypeEnum.PROFILE) && memory.profile?.enabled) {
			const keys = await this.summarize(xpert, LongTermMemoryTypeEnum.PROFILE, memory.profile, {
				chatModel,
				embeddings,
				userId,
				summarizedState,
				agent: primaryAgent
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
			fields.push('question')
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

		const { summary, messages } = (summarizedState[channel] ?? summarizedState) as TMessageChannel
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
				memoryId: z
						.string()
						.optional()
						.describe('The memory ID to overwrite. Only provide if updating an existing memory.'),
				question: z.string().describe("The user's question. For example: \
					There's a problem with my order."),
				answer: z.string().describe("The ai's answer. For example: \
					Please wait, I will check the order status for you!")
			})
			.describe(
				'Upsert a memory in the database. If a memory conflicts with an existing one, \
			update the existing one by passing in the memoryId instead of creating a duplicate. \
			If the user corrects a memory, update it.'
			)

			if (!prompt) {
				prompt = MEMORY_QA_PROMPT
			}
		} else {
			// Default profile LongTermMemoryTypeEnum.PROFILE
			schema = z
				.object({
					memoryId: z
						.string()
						.optional()
						.describe('The memory ID to overwrite. Only provide if updating an existing memory.'),
					profile: z.string().optional().describe(`The main content of the memory. For example: \
          				'User expressed interest in learning about French.'`),
					context: z.string().optional().describe(
						"Additional context for the memory. For example: \
					  'This was mentioned while discussing career options in Europe.'"
					)
				})
				.describe(
					'Upsert a memory in the database. If a memory conflicts with an existing one, \
				update the existing one by passing in the memoryId instead of creating a duplicate. \
				If the user corrects a memory, update it.'
				)

			if (!prompt) {
				prompt = MEMORY_PROFILE_PROMPT
			}
		}

		prompt += `\nThe following are existing memories:\n<memories>\n${formatMemories(items)}\n</memories>`
		const jsonSchema = ToolSchemaParser.serializeJsonSchema(ToolSchemaParser.parseZodToJsonSchema(schema))
		prompt += `\n\nYou can use the following JSON schema to format your response:\n\`\`\`json\n$${jsonSchema}\n\`\`\`\n\n`
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
			const memoryId = (<TMemory>experiences).memoryId
			if (memoryId) {
				await store.delete(namespace, memoryId)
				this.#logger.debug(`Removed top 1 similar memory: ${memoryId}`)
			}
			const query = experiences.profile || experiences.question
			if (query) {
				// Record new memeory
				memoryKey = uuidv4()
				await store.put(namespace, memoryKey, omit(experiences, 'memoryId'))
				this.#logger.debug(`Add a memory: ${JSON.stringify(experiences, null, 2)}`)
			}
		}

		return memoryKey
	}
}
