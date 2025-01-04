import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { tool } from '@langchain/core/tools'
import { ChatGatewayEvent, ChatGatewayMessage, XpertToolContext, JSONValue, OrderTypeEnum, ChatMessageTypeEnum } from '@metad/contracts'
import { AgentRecursionLimit, createAgentStepsInstructions, referencesCommandName } from '@metad/copilot'
import {
	Agent,
	assignDeepOmitBlank,
	C_MEASURES,
	ChartBusinessService,
	ChartMeasure,
	ChartOrient,
	ChartSettings,
	ChartType,
	ChartTypeEnum,
	cloneDeep,
	CubeVariablePrompt,
	DataSettings,
	DataSourceFactory,
	DSCoreService,
	EntityType,
	FilteringLogic,
	getChartType,
	getEntityDimensions,
	isEntitySet,
	makeCubeRulesPrompt,
	markdownModelCube,
	PieVariant,
	PresentationVariant,
	PROMPT_RETRIEVE_DIMENSION_MEMBER,
	PROMPT_TIME_SLICER,
	toAdvancedFilter,
	tryFixDimension,
	tryFixSlicer,
	tryFixVariableSlicer,
	workOutTimeRangeSlicers
} from '@metad/ocap-core'
import {
	CopilotCheckpointSaver,
	CopilotKnowledgeService,
	createExampleFewShotPrompt,
	createReactAgent,
	createReferencesRetrieverTool,
} from '@metad/server-ai'
import { getErrorMessage, race, shortuuid, TimeoutError } from '@metad/server-common'
import { CACHE_MANAGER, Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { omit, upperFirst } from 'lodash'
import { Cache } from 'cache-manager'
import { firstValueFrom, Subject, Subscriber, switchMap, takeUntil } from 'rxjs'
import { In } from 'typeorm'
import { ChatBIModelService } from '../../../chatbi-model/'
import {
	NgmDSCoreService,
	OCAP_AGENT_TOKEN,
	OCAP_DATASOURCE_TOKEN,
	registerSemanticModel
} from '../../../model/ocap'
import { ChatBIService } from '../../chatbi.service'
import { ChatAnswer } from '../../tools'
import { ChatAnswerSchema, GetCubesContextSchema, insightAgentState } from '../../types'
import { ChatBIToolCommand } from '../chat-bi.command'
import { markdownCubes } from '../../graph'

const DefaultToolMaximumWaitTime = 30 * 1000 // 30s

/**
 * @deprecated use ChatBI builtin toolset
 */
type XpertToolChatBIContext = XpertToolContext & {
	maximumWaitTime: number
	models: string[]
}


/**
 * @deprecated use ChatBI builtin toolset
 */
@CommandHandler(ChatBIToolCommand)
export class ChatBIToolHandler implements ICommandHandler<ChatBIToolCommand> {
	private readonly logger = new Logger(ChatBIToolHandler.name)

	readonly commandName = 'chatbi'

	constructor(
		private readonly queryBus: QueryBus,
		private readonly chatBIService: ChatBIService,
		private readonly modelService: ChatBIModelService,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly copilotKnowledgeService: CopilotKnowledgeService,
		@Inject(OCAP_AGENT_TOKEN)
		private agent: Agent,
		@Inject(OCAP_DATASOURCE_TOKEN)
		private dataSourceFactory: { type: string; factory: DataSourceFactory },
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {
		// this.toolsetService.registerCommand('ChatBI', ChatBIToolCommand)
	}

	public async execute(command: ChatBIToolCommand): Promise<any> {
		const { args, runManager, parentConfig } = command
		const parentRunId = runManager?.parentRunId
		const context = parentConfig.configurable as XpertToolChatBIContext

		this.logger.debug(`parentRunId=${parentRunId}, tool_call_id=${context.tool_call_id}, models: [${context.models?.join(', ')}], copilot: ${JSON.stringify(context.copilotModel)}`,)

		const controller = new AbortController()
		const abortEventListener = () => { controller.abort() }
		parentConfig.signal?.addEventListener('abort', abortEventListener)

		// New Ocap context for every chatbi conversation
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)
		// Register all chat models (改成根据 Copilot 角色来)
		const cubesContext = await this.registerChatModels(dsCoreService, context)
		// Prepare LLM
		const { copilotModel, chatModel } = context
		const llm = null
			// <BaseChatModel>chatModel ??
			// createLLM<BaseChatModel>(copilotModel?.copilot, {}, (input) => {
			// 	//
			// })
		const { tenantId, organizationId } = context
		const { thread_id } = parentConfig.configurable as { thread_id: string }
		const { subscriber } = context

		// Create graph
		const graph = this.createGraphAgent(llm, context, dsCoreService, subscriber)

		// Few-shot prompt
		const exampleFewShotPrompt = createExampleFewShotPrompt(this.copilotKnowledgeService, {
			tenantId: tenantId,
			// 知识库跟着 copilot 的配置
			organizationId: organizationId,
			command: this.commandName,
			k: 1
		})
		const { input } = args
		const content = await exampleFewShotPrompt.format({ input: input })
		
		try {
			const streamResults = graph.streamEvents(
				{
					...args,
					messages: [new HumanMessage(content)],
					context: cubesContext
				},
				{
					version: 'v2',
					configurable: {
						thread_id,
						checkpoint_ns: '',
						tenantId,
						organizationId,
					},
					recursionLimit: AgentRecursionLimit,
					signal: controller.signal
					// debug: true
				}
			)

			// let prevEvent = ''
			const tools = {}
			let chatContent = ''
			for await (const { event, data, ...rest } of streamResults) {
				// if (event === 'on_chat_model_stream') {
				// 	if (prevEvent === 'on_chat_model_stream') {
				// 		process.stdout.write('.')
				// 	} else {
				// 		console.log('on_chat_model_stream')
				// 	}
				// } else {
				// 	console.log(event)
				// }
				// prevEvent = event
				
				switch (event) {
					case 'on_chain_start': {
						break
					}
					case 'on_chat_model_start': {
						chatContent = ''
						break
					}
					case 'on_chat_model_stream': {
						const msg = data.chunk as AIMessageChunk
						if (!msg.tool_call_chunks?.length) {
							if (msg.content) {
								chatContent += msg.content
							}
						}
						break
					}
					case 'on_chat_model_end': {
						if (chatContent) {
							// 最终的回答会在主 Agent 中被返回，在此处不用返回结果。
							// subscriber?.next({
							// 	event: ChatGatewayEvent.Agent,
							// 	data: {
							// 		id: parentRunId,
							// 		message: {
							// 			id: shortuuid(),
							// 			role: 'assistant',
							// 			content: chatContent
							// 		}
							// 	}
							// })
						}
						break
					}
					case 'on_tool_start': {
						this.logger.debug(`Tool call '` + rest.name + '\':')
						this.logger.debug(data)
						tools[rest.run_id] = data.input.input
						break
					}
					case 'on_tool_end': {
						let content = `- Tool call: \`${rest.name}\``
						if (tools[rest.run_id]) {
							content += '\n```json\n' + tools[rest.run_id] + '\n```'
						}
						// subscriber?.next({
						// 	event: ChatGatewayEvent.Agent,
						// 	data: {
						// 		id: parentRunId,
						// 		message: {
						// 			id: rest.run_id,
						// 			role: 'tool',
						// 			content
						// 		}
						// 	}
						// })
						break
					}
				}
			}
		} catch (error) {
			console.error(error)
			return `Error:` + getErrorMessage(error)
		} finally {
			parentConfig.signal.removeEventListener('abort', abortEventListener)
		}

		const state = await graph.getState({
			configurable: {
				thread_id,
				checkpoint_ns: ''
			}
		})

		const messages = state.values.messages

		return messages[messages.length - 1].content
	}

	async getCubeCache(modelId: string, cubeName: string) {
		return await this.cacheManager.get<EntityType>(modelId + '/' + cubeName)
	}
	async setCubeCache(modelId: string, cubeName: string, data: EntityType): Promise<void> {
		await this.cacheManager.set(modelId + '/' + cubeName, data)
	}

	async registerChatModels(dsCoreService: DSCoreService, context: XpertToolChatBIContext) {
		const { tenantId, organizationId, models } = context
		const { items } = await this.modelService.findAll({
			where: { tenantId, organizationId, id: In(models) },
			relations: ['model', 'model.dataSource', 'model.dataSource.type', 'model.roles', 'model.indicators', 'xperts'],
			order: {
				visits: OrderTypeEnum.DESC
			}
		})

		// const models = items.filter((item) => xpert ? item.xperts.some((_) => _.id === xpert.id) : true)
			// .map((item) => ({ ...item, model: convertOcapSemanticModel(item.model) }))

		// Register all models
		items.forEach((item) => registerSemanticModel(item.model, dsCoreService))

		return markdownCubes(items)
	}

	createGraphAgent(llm: BaseChatModel, context: XpertToolChatBIContext, dsCoreService: DSCoreService, subscriber: Subscriber<any>) {
		const { tenantId, organizationId } = context

		// Maximum waiting time of tool call
		const { maximumWaitTime = DefaultToolMaximumWaitTime } = context

		const referencesRetrieverTool = createReferencesRetrieverTool(this.copilotKnowledgeService, {
			tenantId,
			organizationId,
			command: [referencesCommandName(this.commandName), referencesCommandName('calculated')],
			k: 3
		})
		// const dimensionMemberRetrieverTool = await this.queryBus.execute(new DimensionMemberRetrieverToolQuery(tenantId, organizationId))

		const getCubeContext = this.createCubeContextTool(dsCoreService, maximumWaitTime)

		const answerTool = this.createChatAnswerTool({
			dsCoreService,
			entityType: null,
			subscriber
		})

		const tools = [referencesRetrieverTool, getCubeContext, answerTool]

		return createReactAgent({
			state: insightAgentState,
			llm,
			checkpointSaver: this.copilotCheckpointSaver,
			// interruptBefore,
			// interruptAfter,
			tools: [...tools],
			messageModifier: async (state) => {
				const systemTemplate = `You are a professional BI data analyst.
{{language}}

The models context is:
{{context}}

For data models that users ask about, call the 'getCubeContext' tool to get detailed information about dataSource, dimensions, measures before answering the question.

If the user explicitly wants to end the conversation, call the 'end' tool to end.
${makeCubeRulesPrompt()}
${PROMPT_RETRIEVE_DIMENSION_MEMBER}
${PROMPT_TIME_SLICER}

If you have any questions about how to analysis data (such as 'how to create a formula of calculated measure', 'how to create some type chart', 'how to create a time slicer about relative time'), please call 'referencesRetriever' tool to get the reference documentations.

${createAgentStepsInstructions(
	`Extract the information mentioned in the problem into 'dimensions', 'measurements', 'time', 'slicers', etc.`,
	// `For every measure, determine whether it exists in the cube context, if it does, proceed directly to the next step, if not found, call the 'createIndicator' tool to create new calculated measure for it. After creating the measure, you need to call the subsequent steps to re-answer the complete answer.`,
	CubeVariablePrompt,
	`If the time condition is a specified fixed time (such as 2023 year, 202202, 2020 Q1), please add it to 'slicers' according to the time dimension. If the time condition is relative (such as this month, last month, last year), please add it to 'timeSlicers'.`,
	`Then call 'answerQuestion' tool to show complete answer to user, don't create image for answer`
)}
`
				const system = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
					templateFormat: 'mustache'
				}).format({ ...state })

				return [new SystemMessage(system), ...state.messages]
			}
		})
	}

	/**
	 * Create tool for get context of cube.
	 * 
	 * @param dsCoreService 
	 * @returns 
	 */
	createCubeContextTool(dsCoreService: DSCoreService, maximumWaitTime: number) {
		
		return tool(
			async ({ cubes }): Promise<string> => {
				this.logger.debug(`Tool 'getCubeContext' params:`, JSON.stringify(cubes))
				try {
					return await race(
						maximumWaitTime,
						async () => {
							let context = ''
							for await (const item of cubes) {
								this.logger.debug(`Start get context for (modelId='${item.modelId}', cube='${item.name}')`)

								let entityType = await this.getCubeCache(item.modelId, item.name)
								if (!entityType) {
									const entitySet = await firstValueFrom(
										dsCoreService
											.getDataSource(item.modelId)
											.pipe(switchMap((dataSource) => dataSource.selectEntitySet(item.name)))
									)
									if (isEntitySet(entitySet)) {
										entityType = entitySet.entityType
										await this.setCubeCache(item.modelId, item.name, entityType)
									} else {
										this.logger.error(`Get context error: `, entitySet.message)
									}
								}
								if (entityType) {
									if (context) {
										context += '\n'
									}

									context += markdownModelCube({
										modelId: item.modelId,
										dataSource: item.modelId,
										cube: entityType
									})

									// Record visit
									await this.modelService.visit(item.modelId, item.name)
								}
							}
							return context
						}
					)
				} catch(err) {
					if (err instanceof TimeoutError) {
						return `Error: Timeout for getting cube context, please confirm whether the model information is correct.`
					} else {
						return `Error: ` + getErrorMessage(err)
					}
				}
			},
			{
				name: 'getCubeContext',
				description: 'Get the context info for cubes',
				schema: GetCubesContextSchema
			}
		)
	}

	createChatAnswerTool(context: ChatBIContext) {
		const { dsCoreService } = context

		return tool(
			async (answer: any): Promise<string> => {
				this.logger.debug(`Execute copilot action 'answerQuestion':`, JSON.stringify(answer, null, 2))
				try {
					let entityType = null
					if (answer.dataSettings) {
						// Make sure datasource exists
						const _dataSource = await dsCoreService._getDataSource(answer.dataSettings.dataSource)
						const entity = await firstValueFrom(
							dsCoreService.selectEntitySet(answer.dataSettings.dataSource, answer.dataSettings.entitySet)
						)
						entityType = entity.entityType
					}

					// Fetch data for chart or table or kpi
					if (answer.dimensions?.length || answer.measures?.length) {
						const { data } = await this.drawChartMessage(
							answer as ChatAnswer,
							{ ...context, entityType }
						)
						// Max limit 100 members
						const members = data
							? JSON.stringify(Object.values(data).slice(0, 100))
							: 'Empty'

						return `The data are:
${members}
`
					}

					return `图表答案已经回复给用户了，请不要重复回答了。`
				} catch (err) {
					this.logger.error(err)
					return `Error: ${err}。如果需要用户提供更多信息，请直接提醒用户。`
				}
			},
			{
				name: 'answerQuestion',
				description: 'Show chart answer for the question to user',
				schema: ChatAnswerSchema
			}
		)
	}

	drawChartMessage(answer: ChatAnswer, context: ChatBIContext): Promise<any> {
		const { dsCoreService, entityType, subscriber } = context
		const chartService = new ChartBusinessService(dsCoreService)
		const destroy$ = new Subject<void>()

		const chartAnnotation = {
			chartType: tryFixChartType(answer.chartType),
			dimensions: answer.dimensions?.map((dimension) => tryFixDimension(dimension, entityType)),
			measures: answer.measures?.map((measure) => fixMeasure(measure, entityType))
		}

		const slicers = []
		if (answer.variables) {
			slicers.push(...answer.variables.map((slicer) => tryFixVariableSlicer(slicer, entityType)))
		}
		if (answer.slicers) {
			slicers.push(...answer.slicers.map((slicer) => tryFixSlicer(slicer, entityType)))
		}
		if (answer.timeSlicers) {
			const timeSlicers = answer.timeSlicers
				.map((slicer) => workOutTimeRangeSlicers(new Date(), { ...slicer, currentDate: 'TODAY' }, entityType))
				.map((ranges) => toAdvancedFilter(ranges, FilteringLogic.And))
			slicers.push(...timeSlicers)
		}

		const presentationVariant: PresentationVariant = {}
		if (answer.top) {
			presentationVariant.maxItems = answer.top
		}
		if (answer.orders) {
			presentationVariant.sortOrder = answer.orders
		}
		presentationVariant.groupBy = getEntityDimensions(entityType)
			.filter((property) => !chartAnnotation.dimensions?.some((item) => item.dimension === property.name))
			.map((property) => ({
				dimension: property.name,
				hierarchy: property.defaultHierarchy,
				level: null
			}))

		// ChartTypes
		const chartTypes = [...CHART_TYPES]
		const index = chartTypes.findIndex(
			({ type, orient }) => type === chartAnnotation.chartType.type && orient === chartAnnotation.chartType.orient
		)
		if (index > -1) {
			chartAnnotation.chartType = chartTypes.splice(index, 1)[0]
		}
		const chartSettings: ChartSettings = {
			universalTransition: true,
			chartTypes
		}

		return new Promise((resolve, reject) => {
			const dataSettings = {
				...answer.dataSettings,
				chartAnnotation,
				presentationVariant
			}
			chartService.selectResult().subscribe((result) => {
				if (result.error) {
					reject(result.error)
				} else {
					if (answer.visualType === 'KPI') {
						subscriber?.next({
							event: ChatGatewayEvent.Message,
							data: {
								id: shortuuid(),
								role: 'component',
								data: {
									type: 'KPI',
									data: result.data,
									dataSettings: {
										...omit(dataSettings, 'chartAnnotation'),
										KPIAnnotation: {
											DataPoint: {
												Value: chartAnnotation.measures[0]
											}
										}
									} as DataSettings,
									slicers,
									title: answer.preface
								} as unknown as JSONValue
							}
						} as ChatGatewayMessage)
					} else {
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.MESSAGE,
								data: {
									id: shortuuid(),
									type: 'component',
									data: {
										type: 'AnalyticalCard',
										data: result.data,
										dataSettings,
										chartSettings,
										slicers,
										title: answer.preface
									} as unknown as JSONValue
								}
							}
						} as MessageEvent)
						
						// subscriber?.next({
						// 	event: ChatGatewayEvent.Message,
						// 	data: {
						// 		id: shortuuid(),
						// 		role: 'component',
						// 		data: {
						// 			type: 'AnalyticalCard',
						// 			data: result.data,
						// 			dataSettings,
						// 			chartSettings,
						// 			slicers,
						// 			title: answer.preface
						// 		} as unknown as JSONValue
						// 	}
						// } as ChatGatewayMessage)
					}
					resolve({ data: result.data })
				}
				destroy$.next()
				destroy$.complete()
			})

			chartService.selectResult()

			chartService
				.onAfterServiceInit()
				.pipe(takeUntil(destroy$))
				.subscribe(() => {
					chartService.refresh()
				})

			chartService.slicers = slicers
			chartService.dataSettings = dataSettings
		})
	}
	
}

type ChatBIContext = {
	dsCoreService: DSCoreService
	entityType: EntityType
	subscriber: Subscriber<any>
}


const CHART_TYPES = [
    {
      name: 'Line',
      type: ChartTypeEnum.Line,
      orient: ChartOrient.vertical,
      chartOptions: {
        legend: {
          show: true
        },
        tooltip: {
          appendToBody: true,
          trigger: 'axis'
        }
      }
    },
    {
      name: 'Column',
      type: ChartTypeEnum.Bar,
      orient: ChartOrient.vertical,
      chartOptions: {
        legend: {
          show: true
        },
        tooltip: {
          appendToBody: true,
          trigger: 'axis'
        }
      }
    },
    {
      name: 'Bar',
      type: ChartTypeEnum.Bar,
      orient: ChartOrient.horizontal,
      chartOptions: {
        legend: {
          show: true
        },
        tooltip: {
          appendToBody: true,
          trigger: 'axis'
        }
      }
    },
    {
      name: 'Pie',
      type: ChartTypeEnum.Pie,
      variant: PieVariant.None,
      chartOptions: {
        seriesStyle: {
          __showitemStyle__: true,
          itemStyle: {
            borderColor: 'white',
            borderWidth: 1,
            borderRadius: 10
          }
        },
        __showlegend__: true,
        legend: {
          type: 'scroll',
          orient: 'vertical',
          right: 0,
          align: 'right'
        },
        tooltip: {
          appendToBody: true
        }
      }
    }
]

function tryFixChartType(chartType: ChartType) {
	return assignDeepOmitBlank(
		cloneDeep(getChartType(upperFirst(chartType.type))?.value.chartType),
		omit(chartType, 'type'),
		5
	)
}

function fixMeasure(measure: ChartMeasure, entityType: EntityType) {
	return {
		...tryFixDimension(measure, entityType),
        dimension: C_MEASURES,
        formatting: {
          shortNumber: true
        },
        palette: {
          name: 'Viridis'
        }
    }
}