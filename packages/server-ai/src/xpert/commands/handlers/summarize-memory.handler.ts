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

		if (!agent.team.memory?.enabled) {
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

		const memory = agent.team.memory

		const { summary, messages } = summarizedState
		let systemTemplate = `${agent.prompt}`
		if (summary) {
			systemTemplate += `\nSummary of conversation earlier: \n${summary}`
		}
		const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
			templateFormat: 'mustache'
		}).format({ ...summarizedState })

		// console.log([systemMessage, ...messages])

		let prompt = memory.prompt
		let schema = null
		const fields = []
		if (memory.type === LongTermMemoryTypeEnum.QA) {
			schema = z.object({
				input: z.string().describe(`The user's input question`),
				output: z.string().describe(`The ai's output answer`)
			})
			if (!prompt) {
				prompt = `总结以上会话的经验，输出一个简短问题和答案`
			}
			fields.push('input')
		} else {
			// Default profile LongTermMemoryTypeEnum.PROFILE
			schema = z.object({
				profile: z.string().describe(`The user's profile`)
			})
			if (!prompt) {
				prompt = `用陈述事实式语气简短一句话总结以上对话的结论，我们将存储至长期记忆中，以便下次能更好地理解和回答用户用户`
			}
			fields.push('profile')
		}

		const experiences = await chatModel
			.withStructuredOutput(schema)
			.invoke([systemMessage, ...messages, new HumanMessage(prompt)])

		// console.log(experiences)

		// let copilot: ICopilot = null
		// if (memory.copilotModel?.copilotId) {
		// 	copilot = await this.queryBus.execute(
		// 		new CopilotGetOneQuery(tenantId, memory.copilotModel.copilotId, ['copilotModel', 'modelProvider'])
		// 	)
		// } else {
		// 	copilot = await this.queryBus.execute(
		// 		new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding, [
		// 			'copilotModel',
		// 			'modelProvider'
		// 		])
		// 	)
		// }

		// if (!copilot?.enabled) {
		// 	throw new CopilotNotFoundException(`Not found the embeddinga role copilot`)
		// }

		// let embeddings = null
		// const copilotModel = memory.copilotModel ?? copilot.copilotModel
		// if (copilotModel && copilot?.modelProvider) {
		// 	embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
		// 		new CopilotModelGetEmbeddingsQuery(copilot, copilotModel, {
		// 			tokenCallback: (token) => {
		// 				execution.embedTokens += token ?? 0
		// 			}
		// 		})
		// 	)
		// }

		const embeddings = await this.queryBus.execute(
			new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {
				tokenCallback: (token) => {
					execution.embedTokens += token ?? 0
				}
			})
		)

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

		let memoryKey = null
		if (Array.isArray(experiences)) {
			memoryKey = []
			const operations = experiences.map((experience) => {
				const key = uuidv4()
				memoryKey.push(key)
				return {
					namespace: [xpert.id],
					key,
					value: experience
				}
			})
			await store.batch(operations)
		} else if (experiences) {
			memoryKey = uuidv4()
			await store.put([xpert.id], memoryKey, experiences)
		}

		await this.commandBus.execute(new XpertAgentExecutionUpsertCommand(execution))

		return memoryKey
	}
}
