import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, HumanMessage, isAIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { FewShotPromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { DynamicStructuredTool, ToolInputParsingException } from '@langchain/core/tools'
import { CompiledStateGraph, END, GraphValueError, START } from '@langchain/langgraph'
import { IChatBIModel, ICopilot, ISemanticModel, OrderTypeEnum, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { AgentRecursionLimit, createAgentStepsInstructions, nanoid, referencesCommandName } from '@metad/copilot'
import {
	CubeVariablePrompt,
	EntityType,
	Indicator,
	isEntitySet,
	isString,
	makeCubeRulesPrompt,
	PROMPT_RETRIEVE_DIMENSION_MEMBER,
	PROMPT_TIME_SLICER,
	Schema
} from '@metad/ocap-core'
import {
	AgentState,
	CopilotCheckpointSaver,
	CopilotKnowledgeService,
	createExampleFewShotPrompt,
	createReactAgent,
	createReferencesRetrieverTool,
} from '@metad/server-ai'
import { Logger } from '@nestjs/common'
import { groupBy } from 'lodash'
import { BehaviorSubject, firstValueFrom, Subject, switchMap, takeUntil } from 'rxjs'
import { ChatBIModelService } from '../chatbi-model/chatbi-model.service'
import { createDimensionMemberRetriever, SemanticModelMemberService } from '../model-member/index'
import { getSemanticModelKey, NgmDSCoreService, registerSemanticModel } from '../model/ocap'
import { ChatBIService } from './chatbi.service'
import { markdownCubes } from './graph/index'
import {
	createChatAnswerTool,
	createCubeContextTool,
	createEndTool,
	errorWithEndMessage
} from './tools'
import { C_CHATBI_END_CONVERSATION, ChatBILarkContext, IChatBIConversation, insightAgentState } from './types'
import { createMoreQuestionsTool } from './tools/more-questions'
import { createWelcomeTool } from './tools/welcome'
import { createIndicatorTool } from './tools/indicator'
import { ChatLarkMessage, ChatStack } from './message'

/**
 * @deprecated Use ChatBI toolset
 */
export class ChatBIConversation implements IChatBIConversation {
	static readonly toolCallTimeout = 30 * 1000 // 30s

	private readonly logger = new Logger(ChatBIConversation.name)
	readonly commandName = 'chatbi'

	public id: string = null
	private destroy$: Subject<void> = new Subject<void>()
	public graph: CompiledStateGraph<AgentState, Partial<AgentState>, typeof START | 'agent' | 'tools'>

	get integrationId() {
		return this.chatContext.integrationId
	}
	get userId() {
		return this.chatContext.userId
	}
	get chatId() {
		return this.chatContext.chatId
	}
	get chatType() {
		return this.chatContext.chatType
	}
	public get threadId() {
		return this.chatContext.userId + '/' + this.chatContext.chatId + '/' + this.id
	}
	get tenantId() {
		return this.chatContext.tenant.id
	}
	// 知识库跟着 copilot 的配置
	get organizationId() {
		return this.copilot.organizationId
	}

	public context: string = null

	private readonly indicators$ = new BehaviorSubject<Indicator[]>([])

	public exampleFewShotPrompt: FewShotPromptTemplate
	private referencesRetrieverTool: DynamicStructuredTool = null
	private dimensionMemberRetrieverTool: DynamicStructuredTool = null

	public models: IChatBIModel[]
	public chatModelId: string = null

	private message: ChatLarkMessage = null

	private status: 'init' | 'idle' | 'running' | 'error' = 'init'
	private chatStack: ChatStack[] = []
	
	constructor(
		private readonly chatContext: ChatBILarkContext,
		private readonly chatModel: BaseChatModel,
		private readonly modelService: ChatBIModelService,
		// private readonly semanticModelMemberService: SemanticModelMemberService,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly dsCoreService: NgmDSCoreService,
		private readonly copilotKnowledgeService: CopilotKnowledgeService,
		private readonly chatBIService: ChatBIService,
		public readonly copilot: ICopilot
	) {
		this.exampleFewShotPrompt = createExampleFewShotPrompt(this.copilotKnowledgeService, {
			tenantId: this.tenantId,
			// 知识库跟着 copilot 的配置
			organizationId: this.organizationId,
			command: this.commandName,
			k: 1
		})

		this.referencesRetrieverTool = createReferencesRetrieverTool(this.copilotKnowledgeService, {
			tenantId: this.tenantId,
			// 知识库跟着 copilot 的配置
			organizationId: this.organizationId,
			command: [referencesCommandName(this.commandName), referencesCommandName('calculated')],
			k: 3
		})

		// this.dimensionMemberRetrieverTool = createDimensionMemberRetrieverTool(
		// 	this.tenantId,
		// 	// 知识库跟着 copilot 的配置
		// 	this.organizationId,
		// 	createDimensionMemberRetriever({ logger: this.logger }, this.semanticModelMemberService)
		// )

		// Indicators
		this.indicators$.pipe(takeUntil(this.destroy$)).subscribe(async (indicators) => {
			const models = groupBy(indicators, 'modelId')
			for await (const modelId of Object.keys(models)) {
				const indicators = models[modelId]
				const modelKey = this.getModelKey(modelId)
				const dataSource = await firstValueFrom(this.dsCoreService.getDataSource(modelKey))
				const schema = dataSource.options.schema
				const _indicators = [...(schema?.indicators ?? [])].filter(
					(indicator) => !indicators.some((item) => item.id === indicator.id && item.code === indicator.code)
				)
				_indicators.push(...indicators)

				this.logger.debug(`Set New indicators for dataSource ${dataSource.id}: ${JSON.stringify(_indicators.map((indicator) => indicator.code))}`, )

				dataSource.setSchema({
					...(dataSource.options.schema ?? {}),
					indicators: _indicators
				} as Schema)
			}
		})

		this.graph = this.createAgentGraph()
	}

	async initThread() {
		if (!this.id) {
			await this.newThread()
		}
	}

	getModel(id: string) {
		return this.models.find((item) => item.modelId === id)?.model
	}
	getModelKey(id: string) {
		const model = this.getModel(id)
		return getSemanticModelKey(model)
	}

	upsertIndicator(indicator: any) {
		this.logger.debug(`New indicator in chatbi:`, indicator)
		const indicators = [...this.indicators$.value]
		const index = indicators.findIndex((item) => item.id === indicator.id && item.code === indicator.code)
		if (index > -1) {
			indicators[index] = {
				...indicators[index],
				...indicator
			}
		} else {
			indicators.push({ ...indicator, visible: true })
		}

		this.indicators$.next(indicators)
	}

	async newThread() {
		this.id = nanoid()

		const { items } = await this.modelService.findAll({
			where: { tenantId: this.chatContext.tenant.id, organizationId: this.chatContext.organizationId },
			relations: ['model', 'model.dataSource', 'model.dataSource.type', 'model.roles', 'model.indicators', 'integrations'],
			order: {
				visits: OrderTypeEnum.DESC
			}
		})

		// const models = items.map((item) => ({...item, model: convertOcapSemanticModel(item.model)}))

		this.logger.debug(`Chat models visits:`, items.map(({ visits }) => visits).join(', '))

		this.models = items.filter((item) => item.integrations.some((_) => _.id === this.integrationId))
		this.indicators$.next([])

		this.graph.updateState(
			{
				configurable: {
					thread_id: this.threadId
				}
			},
			{ language: `Please answer in language 'zh-Hans'` }
		)

		// Register all models
		this.models.forEach((item) => this.registerModel(item.model))

		const top3Cubes = this.models.slice(0, 3)
		const restCubes = this.models.slice(3)

		this.context = `The top 3 cubes info:
${markdownCubes(top3Cubes)}
${restCubes.length ? `The rest cubes:` : ''}
${markdownCubes(this.models.slice(3))}
`
	}

	destroy() {
		this.destroy$.next()
	}

	registerModel(model: ISemanticModel) {
		registerSemanticModel(model, this.dsCoreService)
	}

	createAgentGraph() {
		const chatId = this.chatId
		const chatContext = this.chatContext
		const answerTool = createChatAnswerTool(
			{
				chatId,
				logger: this.logger,
				larkService: chatContext.larkService,
				dsCoreService: this.dsCoreService,
				conversation: this
			},
			chatContext
		)

		const getCubeContext = createCubeContextTool(
			{
				logger: this.logger,
				conversation: this,
				dsCoreService: this.dsCoreService,
				larkService: chatContext.larkService
			},
			this.modelService
		)
		const endTool = createEndTool({
			logger: this.logger,
			conversation: this,
			larkService: chatContext.larkService
		})

		const welcomeTool = createWelcomeTool({ conversation: this })
		const moreQuestionsTool = createMoreQuestionsTool({ conversation: this })

		const indicatorTool = createIndicatorTool(this.chatModel, this.referencesRetrieverTool, {
			logger: this.logger,
			conversation: this,
			larkService: chatContext.larkService
		},)
		const tools = [
			// this.dimensionMemberRetrieverTool,
			this.referencesRetrieverTool,
			getCubeContext,
			welcomeTool,
			indicatorTool,
			answerTool,
			moreQuestionsTool,
			endTool
		]
		
		return createReactAgent({
			state: insightAgentState,
			llm: this.chatModel,
			checkpointSaver: this.copilotCheckpointSaver,
			// interruptBefore,
			// interruptAfter,
			tools: [...tools],
			messageModifier: async (state) => {
				const systemTemplate = `You are a professional BI data analyst.
{{language}}

如果没有收到用户明确问题时，请根据 models context 调用 'welcome' tool 针对 top 3 的模型分别给出用户可能关心的 3 条问题。

The models context is:
{{context}}

For data models that users ask about, call the 'getCubeContext' tool to get detailed information about dataSource, dimensions, measures before answering the question.

If the user explicitly wants to end the conversation, call the 'end' tool to end.
${makeCubeRulesPrompt()}
${PROMPT_RETRIEVE_DIMENSION_MEMBER}
${PROMPT_TIME_SLICER}

If you have any questions about how to analysis data (such as 'how to create some type chart', 'how to create a time slicer about relative time'), please call 'referencesRetriever' tool to get the reference documentations.

${createAgentStepsInstructions(
	`Extract the information mentioned in the problem into 'dimensions', 'measurements', 'time', 'slicers', etc.`,
	`For every measure, determine whether it exists in the cube context, if it does, proceed directly to the next step, if not found, call the 'createIndicator' tool to create new calculated measure for it. After creating the measure, you need to call the subsequent steps to re-answer the complete answer.`,
	CubeVariablePrompt,
	`If the time condition is a specified fixed time (such as xxxx year, yyyyMM, yyyy Q1), please add it to 'slicers' according to the time dimension. If the time condition is relative (such as this month, last month, last year, this year), please add it to 'timeSlicers'.`,
	`Then call 'answerQuestion' tool to show complete answer to user, don't create image for answer`,
	`Finally, ref to the result of 'answerQuestion' tool, call 'giveMoreQuestions' tool to give more analysis suggestions`
)}
`
				const system = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
					templateFormat: 'mustache'
				}).format({ ...state })
				return [new SystemMessage(system), ...state.messages]
			},
			shouldToolContinue: (state) => {
				const lastMessage = state.messages[state.messages.length - 1]
				this.logger.debug(`[ChatBI] [After tool call] name: ${lastMessage.name}`)
				if (isToolMessage(lastMessage)) {
					if (['giveMoreQuestions', 'welcome', 'end', 'answerQuestion'].includes(lastMessage.name)) {
						const content = lastMessage.content
						// 可能是 Received tool input did not match expected schema
						if (isString(content) && content.startsWith('Error:')) {
							this.logger.error(content)
							const toolCallMessage = state.messages[state.messages.length - 2]
							this.logger.verbose((<ToolMessage>toolCallMessage).lc_kwargs)
							return 'agent'
						}

						if (['answerQuestion'].includes(lastMessage.name) && !this.chatStack.length) {
							return 'agent'
						}

						return END
					}
				}
	
				return 'agent'
			}
		})
	}

	/**
	 * 接收来自客户端的消息文本，进行思考回答
	 * 
	 * @param text 
	 */
	async ask(text: string, message?: ChatLarkMessage) {
		// Running, please wait
		if (this.status === 'running') {
			const chatStack = {text, message: new ChatLarkMessage(this.chatContext as any, text, this)}
			await chatStack.message.update({status: 'waiting'})
			this.chatStack.push(chatStack)
			return
		}

		// Set running status
		this.status = 'running'
		// Send thinking message to user
		// this.thinkingMessageId = messageId ?? await createThinkingMessage(this.chatContext, text)
		this.message = message ?? new ChatLarkMessage(this.chatContext as any, text, this)
		await this.message.update({status: 'thinking'})

		// Init new thread
		await this.initThread()
		// Model context
		let context = null
		const session = null // this.chatBIService.userSessions[this.userId]
		if (this.chatType === 'p2p' && session?.chatModelId) {
			const chatModel = this.models.find((item) => item.id === session.chatModelId)
			context = markdownCubes([chatModel])
		} else {
			context = this.context
		}

		// Few-shot prompt
		this.logger.verbose(`ExampleFewShot start for user input: ${text}`)
		const content = await this.exampleFewShotPrompt.format({ input: text })
		this.logger.verbose(`ExampleFewShot got content: ${content}`)

		const streamResults = await this.graph.stream(
			{
				input: text,
				messages: [new HumanMessage(content)],
				context,
			},
			{
				configurable: {
					thread_id: this.threadId
				},
				recursionLimit: AgentRecursionLimit
				// debug: true
			}
		)
		let verboseContent = ''
		let end = false
		try {
			for await (const output of streamResults) {
				if (!output?.__end__) {
					let content = ''
					Object.entries(output).forEach(
						([key, value]: [
							string,
							{
								messages?: HumanMessage[]
								next?: string
								instructions?: string
								reasoning?: string
							}
						]) => {
							content += content ? '\n' : ''
							if (value.messages) {
								const _message = value.messages[0]
								if (isAIMessage(_message)) {
									if (_message.tool_calls?.length > 0) {
										//
									} else if (_message.content) {
										//   if (this.verbose()) {
										//     content += `<b>${key}</b>\n`
										//   }
										content += value.messages.map((m) => m.content).join('\n\n')
									}
								}
							}
						}
					)

					if (content) {
						verboseContent = content
						this.logger.debug(`[ChatBI] [Graph] verbose content: `, verboseContent)
						// 对话结束时还有正在思考的消息，则意味着出现错误
						if (['thinking', 'continuing', 'waiting'].includes(this.message?.status)) {
							this.message.update({
								status: XpertAgentExecutionStatusEnum.ERROR,
								elements: [{tag: 'markdown', content: verboseContent}]
							})
						}
					}
					if (this.message?.status === XpertAgentExecutionStatusEnum.SUCCESS) {
					  break
					}
				}
			}

			// Idle: at the end of a conversation
			this.status = 'idle'

		} catch (err: any) {
			this.logger.error(err)
			this.status = 'error'
			if (err instanceof ToolInputParsingException) {
				this.chatContext.larkService.errorMessage(this.chatContext, err)
			} else if (err instanceof GraphValueError) {
				end = true
			} else {
				// larkService.errorMessage(input, err)
				await errorWithEndMessage(this.chatContext, err.message, this)
			}
		}

		if (this.chatStack.length > 0) {
			const chatStack = this.chatStack.shift()
			await this.ask(chatStack.text, chatStack.message)
		}
	}

	async getCube(modelId: string, cubeName: string) {
		const entitySet = await firstValueFrom(
			this.dsCoreService.getDataSource(modelId).pipe(
				switchMap((dataSource) => dataSource.selectEntitySet(cubeName)),
			)
		)
		if (isEntitySet(entitySet)) {
			const entityType = entitySet.entityType
			await this.setCubeCache(modelId, cubeName, entityType)
			return entityType
		} else {
			this.logger.error(`Get cube '${cubeName}' context error: `, entitySet.message)
			return null
		}
	}

	async getCubeCache(modelId: string, cubeName: string) {
		return await this.chatBIService.cacheManager.get<EntityType>(modelId + '/' + cubeName)
	}
	async setCubeCache(modelId: string, cubeName: string, data: EntityType): Promise<void> {
		await this.chatBIService.cacheManager.set(modelId + '/' + cubeName, data)
	}

	messageWithEndAction(contents: any[], callback?: (action: any) => void | Promise<void>) {
		const message = {
			config: {
				wide_screen_mode: true
			},
			elements: [
				...contents,
				{
					tag: 'action',
					actions: [
						{
							tag: 'button',
							text: {
								tag: 'plain_text',
								content: '结束对话'
							},
							type: 'primary_text',
							complex_interaction: true,
							width: 'default',
							size: 'medium',
							value: C_CHATBI_END_CONVERSATION
						}
					]
				}
			]
		}

		this.chatContext.larkService.createAction(this.chatContext, message).subscribe({
			next: async (action) => {
				if (action?.value === C_CHATBI_END_CONVERSATION || action?.value === `"${C_CHATBI_END_CONVERSATION}"`) {
					await this.end()
				} else {
					callback?.(action)
				}
			},
			error: (err) => {
				console.error(err)
			}
		})
	}

	async end() {
		const session = this.chatBIService.userSessions[this.userId]
		if (session) {
			session.chatModelId = null
		}

		await this.message.update({status: XpertAgentExecutionStatusEnum.SUCCESS, elements: [
			{
				tag: 'markdown',
				content: `对话已结束。如果您有其他问题，欢迎随时再来咨询。`
			}
		]})

		await this.newThread()
	}

	async continue(elements: any[]) {
		await this.message.update({status: 'continuing', elements})
	}
	async done(card: {elements: any[]; header: any}) {
		await this.message.update({...card, status: XpertAgentExecutionStatusEnum.SUCCESS })
	}
	async updateMessage(card: {elements: any[]; header: any; action: (action) => void}) {
		await this.message.update(card)
	}
}

function isToolMessage(message: BaseMessage): message is ToolMessage {
	return message instanceof ToolMessage
}
