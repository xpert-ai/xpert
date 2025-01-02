import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Agent, DataSourceFactory } from '@metad/ocap-core'
import {
	CopilotCheckLimitCommand,
	CopilotCheckpointSaver,
	CopilotKnowledgeService,
	CopilotService,
	CopilotTokenRecordCommand,
	createLLM,
	CopilotModelGetChatModelQuery
} from '@metad/server-ai'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { ChatBIModelService } from '../../../chatbi-model'
import { SemanticModelMemberService } from '../../../model-member'
import { NgmDSCoreService, OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN } from '../../../model/ocap'
import { ChatBIService } from '../../chatbi.service'
import { ChatBIConversation } from '../../conversation'
import { ChatBILarkContext } from '../../types'
import { ChatBICommand } from '../chatbi.command'
import { AiProviderRole } from '@metad/contracts'

@CommandHandler(ChatBICommand)
export class ChatBIHandler implements ICommandHandler<ChatBICommand> {
	private readonly logger = new Logger(ChatBIHandler.name)

	readonly commandName = 'chatbi'

	readonly userConversations = new Map<string, ChatBIConversation>()

	constructor(
		private readonly copilotService: CopilotService,
		private readonly modelService: ChatBIModelService,
		private readonly semanticModelMemberService: SemanticModelMemberService,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly copilotKnowledgeService: CopilotKnowledgeService,
		private readonly chatBIService: ChatBIService,
		@Inject(OCAP_AGENT_TOKEN)
		private agent: Agent,
		@Inject(OCAP_DATASOURCE_TOKEN)
		private dataSourceFactory: { type: string; factory: DataSourceFactory },
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	public async execute(command: ChatBICommand): Promise<any> {
		const { input } = command
		const { tenant, organizationId, userId, larkService } = input

		const conversation = await this.getUserConversation(input)
		if (!conversation) {
			return await larkService.errorMessage(
				input,
				new Error(`Failed to create chat conversation for user: ${input.userId}`)
			)
		}

		// Check token limit
		try {
			await this.commandBus.execute(new CopilotCheckLimitCommand({
				tenantId: tenant.id,
				organizationId,
				userId,
				copilot: conversation.copilot
			}))
		} catch(err) {
			return await larkService.errorMessage(
				input,
				err
			)
		}

		// Ask
		conversation.ask(input.text).then().catch((err) => {
			console.error(err)
			larkService.errorMessage(
				input,
				new Error(`Internal Error!`)
			).catch((err) => console.error(err))
		})

		return
	}

	async getUserConversation(input: ChatBILarkContext): Promise<ChatBIConversation> {
		const { chatId, userId, larkService } = input
		const conversationId = userId + '/' + chatId
		if (!this.userConversations.get(conversationId)) {
			this.logger.debug(`未找到会话，新建会话为用户：${userId}`)
			try {
				this.userConversations.set(conversationId, await this.createChatConversation(input))
			} catch (err) {
				console.error(err)
				larkService.errorMessage(input, err)
			}
		}

		return this.userConversations.get(conversationId)
	}

	/**
	 * Create ChatBIConversation for lark user
	 * 
	 * @param input Context of lark user
	 * @returns ChatBIConversation
	 */
	async createChatConversation(input: ChatBILarkContext) {
		const { tenant, organizationId } = input
		const tenantId = tenant.id
		const copilot = await this.copilotService.findOneByRole(AiProviderRole.Primary, tenantId, organizationId)
		// const copilot = items.find((item) => item.role === AiProviderRole.Primary)
		if (!copilot?.enabled) {
			throw new Error(
				`No 'Primary' copilot found for tenant='${tenantId}' and organization='${organizationId}'`
			)
		}

		const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(copilot, null, {})
		)
		
		// createLLM<BaseChatModel>(copilot, {}, async (input) => {
		// 	try {
		// 		await this.commandBus.execute(
		// 			new CopilotTokenRecordCommand({
		// 				...input,
		// 				tenantId: tenantId,
		// 				organizationId: organizationId,
		// 				userId: user?.id,
		// 				copilot: copilot
		// 			})
		// 		)
		// 	} catch(err) {
		// 		//
		// 	}
		// })

		if (!chatModel) {
			throw new Error(
				`Failed to create ChatModel for Copilot(provider='${copilot.provider}', role='${copilot.role}', defaultModel='${copilot.defaultModel}')`
			)
		}

		return new ChatBIConversation(
			input,
			chatModel,
			this.modelService,
			// this.semanticModelMemberService,
			this.copilotCheckpointSaver,
			// New Ocap context for every chatbi conversation
			new NgmDSCoreService(this.agent, this.dataSourceFactory),
			this.copilotKnowledgeService,
			this.chatBIService,
			copilot
		)
	}
}
