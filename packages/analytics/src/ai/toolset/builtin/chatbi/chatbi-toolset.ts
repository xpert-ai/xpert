import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ToolMessage } from '@langchain/core/messages'
import { Tool, tool } from '@langchain/core/tools'
import { Command, getCurrentTaskInput, LangGraphRunnableConfig } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	getToolCallIdFromConfig,
	IChatBIModel,
	IIndicator,
	isToolEnabled,
	OrderTypeEnum,
	TAgentRunnableConfigurable,
	TMessageComponent,
	TMessageContentComponent,
	TStateVariable,
	TToolCredentials
} from '@metad/contracts'
import {
	AggregationRole,
	BarVariant,
	C_MEASURES,
	CalculationType,
	ChartAnnotation,
	ChartBusinessService,
	ChartOrient,
	ChartSettings,
	ChartTypeEnum,
	DataSettings,
	DSCoreService,
	EntityType,
	FilteringLogic,
	getEntityDimensions,
	getEntityProperty,
	Indicator,
	isEntitySet,
	markdownModelCube,
	PresentationVariant,
	Schema,
	toAdvancedFilter,
	tryFixDimension,
	tryFixMeasureName,
	tryFixOrder,
	tryFixSlicer,
	tryFixVariableSlicer,
	workOutTimeRangeSlicers
} from '@metad/ocap-core'
import { BuiltinToolset, ToolNotSupportedError, ToolProviderCredentialValidationError } from '@metad/server-ai'
import { getErrorMessage, isEmpty, omit, race, shortuuid, TimeoutError } from '@metad/server-common'
import { t } from 'i18next'
import { groupBy, upperFirst } from 'lodash'
import { firstValueFrom, Subject, switchMap, takeUntil } from 'rxjs'
import { In } from 'typeorm'
import { z } from 'zod'
import { getSemanticModelKey, NgmDSCoreService, registerSemanticModel } from '../../../../model/ocap'
import { CHART_TYPES, ChatAnswer, ChatAnswerSchema, ChatBIContext, ChatBIToolsEnum, extractDataValue, limitDataResults, TChatBICredentials, tryFixDimensions } from './types'
import { fixMeasure, markdownCubes, tryFixChartType, tryFixFormula } from '../../types'
import { TBIContext } from '../../../types'
import { GetBIContextQuery } from '../../../queries'
import { IndicatorSchema } from '../../schema'
import { TOOL_CHATBI_PROMPTS_DEFAULT } from './prompts'
import { BIVariableEnum, mapTimeSlicer } from '../bi-toolset'
import { buildDimensionMemberRetrieverTool } from '../tools/dimension_member_retriever'
import { drawTableMessage } from './tools/answer_question'


function cubesReducer(a, b) {
	return [...a.filter((_) => !b?.some((item) => item.cubeName === _.cubeName)), ...(b ?? [])]
}

export abstract class AbstractChatBIToolset extends BuiltinToolset {
	biContext: TBIContext

	get dsCoreService() {
		return this.biContext.dsCoreService
	}
	get modelService() {
		return this.biContext.modelService
	}
	get cacheManager() {
		return this.biContext.cacheManager
	}

	get toolsetCredentials() {
		return this.toolset.credentials as TChatBICredentials
	}

	protected models: IChatBIModel[]

	private async initModels() {
		this.biContext = await this.queryBus.execute<GetBIContextQuery, TBIContext>(new GetBIContextQuery())
		this.models = await this.registerChatModels(this.toolset.credentials.models)
	}

	async getVariables() {
		if (!this.models) {
			await this.initModels()
		}
		return [
			{
				name: 'tool_chatbi_prompts_default',
				type: 'string',
				description: 'Default prompt for chatbi toolset',
				reducer: (a: string, b: string) => {
					return a || b
				},
				default: () => {
					return TOOL_CHATBI_PROMPTS_DEFAULT
				}
			} as TStateVariable,
			{
				name: 'chatbi_models',
				type: 'array[object]',
				description: 'Models for ChatBI',
				reducer: (a, b) => {
					return b ?? a
				},
				default: () => {
					return markdownCubes(this.models)
				}
			} as TStateVariable,
			{
				name: 'chatbi_cubes',
				type: 'array[object]',
				description: 'Cubes details for ChatBI',
				reducer: cubesReducer,
				default: () => {
					return []
				}
			} as TStateVariable,
			{
				name: 'chatbi_cubes_context',
				type: 'string',
				description: 'Cubes contexts',
			} as TStateVariable,
			{
				name: BIVariableEnum.INDICATORS,
				type: 'array[object]',
				description: 'Indicators in cube',
				reducer: (a: IIndicator[], b: IIndicator[]) => {
					return [...a.filter((_) => !b.some((indicator) => indicator.code === _.code)), ...b]
				},
				default: () => {
					return []
				}
			} as TStateVariable
		]
	}

	async initTools() {
		if (!this.toolset) {
			throw new ToolNotSupportedError(`Toolset not provided for '${this.constructor.prototype.provider}'`)
		}
		const tools = this.toolset.tools.filter((_) => isToolEnabled(_, this.toolset.options?.disableToolDefault))

		await this.initModels()

		this.tools = []
		const allAllowed = !this.toolset.tools?.length
		
		if (allAllowed || tools.find((_) => _.name === ChatBIToolsEnum.GET_AVAILABLE_CUBES)) {
			this.tools.push(this.createGetAvailableCubes() as unknown as Tool)
		}
		if (allAllowed || tools.find((_) => _.name === ChatBIToolsEnum.GET_CUBE_CONTEXT)) {
			this.tools.push(this.createCubeContextTool(this.dsCoreService) as unknown as Tool)
		}
		if (allAllowed || tools.find((_) => _.name === ChatBIToolsEnum.MEMBER_RETRIEVER)) {
			const dimensionMemberRetrieverTool = buildDimensionMemberRetrieverTool(
				{
					dsCoreService: this.dsCoreService,
					commandBus: this.commandBus
				},
				ChatBIToolsEnum.MEMBER_RETRIEVER,
			)
			
			this.tools.push(dimensionMemberRetrieverTool)
		}

		if (allAllowed || tools.find((_) => _.name === ChatBIToolsEnum.CREATE_INDICATOR)) {
			this.tools.push(this.createIndicatorTool(this.dsCoreService))
		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		const models = credentials.models
		if (!models || models.length === 0) {
			throw new ToolProviderCredentialValidationError('Models array is empty')
		}
	}

	/**
	 * Find and register semantic models for toolset.
	 * 
	 * @param models 
	 * @returns 
	 */
	async registerChatModels(models: string[]) {
		const { items } = await this.modelService.findAll({
			where: { tenantId: this.tenantId, organizationId: this.organizationId, id: In(models) },
			relations: [
				'model',
				'model.dataSource',
				'model.dataSource.type',
				'model.roles',
				'model.indicators',
			],
			order: {
				visits: OrderTypeEnum.DESC
			}
		})
		// Check exist
		for await (const id of models) {
			if (!items.some((_) => _.id === id)) {
				throw new Error(t('analytics:Error.ChatBIModelNotFound', {model: id, toolset: this.toolset.name}))
			}
		}

		// Register all models
		items.forEach((item) => registerSemanticModel(item.model, false, this.dsCoreService))

		return items
	}

	/**
	 * Update new indicators for semantic model in data source.
	 * 
	 * @param dsCoreService Data source service
	 * @param indicators New indicators
	 */
	async updateIndicators(dsCoreService: DSCoreService, indicators: Indicator[]) {
		const models = groupBy(indicators, 'modelId')
		for await (const modelId of Object.keys(models)) {
			const indicators = models[modelId]
			const modelKey = this.getModelKey(modelId)
			const dataSource = await firstValueFrom(dsCoreService.getDataSource(modelKey))
			const schema = dataSource.options.schema
			const _indicators = [...(schema?.indicators ?? [])].filter(
				(indicator) => !indicators.some((item) => item.id === indicator.id && item.code === indicator.code)
			)
			_indicators.push(...indicators)

			this.logger.verbose(
				`Set New indicators for dataSource ${dataSource.id}: ${JSON.stringify(_indicators.map((indicator) => indicator.code))}`
			)

			dataSource.setSchema({
				...(dataSource.options.schema ?? {}),
				indicators: _indicators
			} as Schema)
		}
	}

	/**
	 * Get chatbi model by semantic model id
	 * 
	 * @param id Semantic model id
	 * @returns ChatBIModel
	 */
	getModel(id: string) {
		return this.models.find((item) => item.modelId === id)?.model
	}
	getModelKey(id: string) {
		const model = this.getModel(id)
		return getSemanticModelKey(model)
	}

	/**
	 * Get EntityType of cube from cache
	 *
	 * @param modelId Semantic Model ID
	 * @param cubeName Name of cube
	 * @returns EntityType
	 */
	async getCubeCache(modelId: string, cubeName: string) {
		return await this.cacheManager.get<EntityType>('chatbi:' + modelId + '/' + cubeName)
	}
	/**
	 * Save EntityType of cube in cache
	 *
	 * @param modelId Semantic Model ID
	 * @param cubeName Name of cube
	 * @param data EntityType
	 */
	async setCubeCache(modelId: string, cubeName: string, data: EntityType): Promise<void> {
		await this.cacheManager.set('chatbi:' + modelId + '/' + cubeName, data)
	}

	createGetAvailableCubes() {
		return tool(
			async () => {
				return markdownCubes(this.models)
			},
			{
				name: 'get_available_cubes',
				description: 'Get available cubes list',
				schema: z.object({})
			}
		)
	}

	/**
	 * Create tool for get context of cube.
	 *
	 * @param dsCoreService
	 * @returns
	 */
	createCubeContextTool(dsCoreService: DSCoreService) {
		const maximumWaitTime = 3000
		return tool(
			async ({ modelId, name }, config: LangGraphRunnableConfig) => {
				this.logger.debug(`Tool 'get_cube_context' params:`, modelId, name)
				const toolCallId = getToolCallIdFromConfig(config)
				// Tool message event
				await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
					id: toolCallId,
					category: 'Tool',
					message: name,
				})
				try {
					// Fetch a context variable named "currentState".
					// We have set this variable explicitly in each ToolNode invoke method that calls this tool.
					const currentState = getCurrentTaskInput<{chatbi_cubes: any[]}>()

					return await race(maximumWaitTime, async () => {
						const cubes = []
						for await (const item of [{ modelId, name }]) {
							this.logger.debug(`Start get context for (modelId='${item.modelId}', cube='${item.name}')`)

							let entityType = await this.getCubeCache(item.modelId, item.name)
							if (!entityType) {
								// Update runtime indicators
								const indicators = currentState[BIVariableEnum.INDICATORS]
								if (indicators) {
									await this.updateIndicators(dsCoreService, indicators)
								}

								// Fetch EntityType for cube
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
								cubes.push({
									cubeName: item.name,
									context: markdownModelCube({
										modelId: item.modelId,
										dataSource: item.modelId,
										cube: entityType
									})
								})

								// Record visit
								await this.modelService.visit(item.modelId, item.name)
							}
						}

						// Populated when a tool is called with a tool call from a model as input
						return new Command({
							update: {
								chatbi_cubes: cubes,
								chatbi_cubes_context: cubesReducer(currentState?.chatbi_cubes ?? [], cubes)
									.map(({ context }) => context)
									.join('\n\n'),
								// update the message history
								messages: [
									new ToolMessage({
										content: cubes.map(({ context }) => context).join('\n\n'),
										tool_call_id: toolCallId,
										status: 'success',
									})
								]
							}
						})
					})
				} catch (err) {
					if (err instanceof TimeoutError) {
						throw new Error(`Timeout for getting cube context, please confirm whether the model information is correct.`)
					}
					throw err
				}
			},
			{
				name: 'get_cube_context',
				description: 'Get the context info for the cubes',
				schema: z.object({
					modelId: z.string().describe('The model id of cube'),
					name: z.string().describe('The name of cube')
				})
			}
		)
	}

	createChatAnswerTool(context: ChatBIContext, credentials: TChatBICredentials) {
		const { dsCoreService } = context
		const { dataPermission } = credentials

		return tool(
			async (params, config: LangGraphRunnableConfig): Promise<string> => {
				const { configurable } = config ?? {}
				const { language } = configurable ?? {}
				const currentState = getCurrentTaskInput()
				this.logger.debug(`Execute tool '${ChatBIToolsEnum.ANSWER_QUESTION}':`, JSON.stringify(params, null, 2))

				const answer = params as ChatAnswer

				// Update runtime indicators
				const indicators = currentState[BIVariableEnum.INDICATORS]
				if (indicators) {
					await this.updateIndicators(dsCoreService, indicators)
				}

				let entityType = null
				if (answer.dataSettings) {
					// Make sure datasource exists
					const _dataSource = await dsCoreService._getDataSource(answer.dataSettings.dataSource)
					const entity = await firstValueFrom(
						_dataSource.selectEntitySet(answer.dataSettings.entitySet)
					)
					if (isEntitySet(entity)) {
					    entityType = entity.entityType
					} else {
						throw entity
					}

					if (answer.calculated_members?.length) {
						_dataSource.updateOptions((options) => {
							return {
								...options,
								calculatedMeasures: {
									...(options.calculatedMeasures ?? {}),
									[answer.dataSettings.entitySet]: answer.calculated_members.map((member) => {
										return {
											...member,
											name: tryFixMeasureName(member.name),
											role: AggregationRole.measure,
											calculationType: CalculationType.Calculated,
											visible: true
										}
									})
								}
							}
						})
						// Get the entityType after updating the calculated member
						const entity = await firstValueFrom(
							_dataSource.selectEntitySet(answer.dataSettings.entitySet)
						)
						if (isEntitySet(entity)) {
							entityType = entity.entityType
						} else {
							throw entity
						}
					}
				}

				// Fetch data for chart or table or kpi
				if (answer.dimensions?.length || answer.measures?.length) {
					try {
						let data = null
						if (answer.visualType === 'Table') {
							data = await drawTableMessage(
								answer as ChatAnswer,
								{ ...context, entityType, language },
								configurable as TAgentRunnableConfigurable,
								credentials
							)
						} else {
							data = await this.drawChartMessage(
								answer as ChatAnswer,
								{ ...context, entityType, language },
								configurable as TAgentRunnableConfigurable,
								credentials
							)
						}

						const results = limitDataResults(data, credentials)

						return `The chart answer has already been provided to the user and the data of query are:\n${results}\n`
					} catch(err) {
						throw new Error(getErrorMessage(err))
					}
				}

				return `The chart answer has already been provided to the user, please do not repeat the response.`
			},
			{
				name: ChatBIToolsEnum.ANSWER_QUESTION,
				description: 'Show chart answer for the question to user',
				schema: ChatAnswerSchema,
				verboseParsingErrors: true
			}
		)
	}

	async drawChartMessage(answer: ChatAnswer, context: ChatBIContext, configurable: TAgentRunnableConfigurable, credentials: TChatBICredentials): Promise<any> {
		const { dsCoreService, entityType, chatbi, language } = context
		const { subscriber, agentKey, xpertName, tool_call_id } = configurable ?? {}

		const currentState = getCurrentTaskInput()
		// const lang = currentState[STATE_VARIABLE_SYS]?.language
		const indicators = currentState[BIVariableEnum.INDICATORS]?.map((_) => omit(_, 'default', 'reducer'))
		const chartService = new ChartBusinessService(dsCoreService)
		const destroy$ = new Subject<void>()

		const chartAnnotation: ChartAnnotation = {
			chartType: tryFixChartType(answer.visualType),
			dimensions: tryFixDimensions(answer.dimensions?.map((dimension) => tryFixDimension(dimension, entityType))),
			measures: answer.measures?.map((measure) => {
				measure = fixMeasure(measure, entityType)
				const property = getEntityProperty(entityType, measure.measure)
				if (!property) {
					throw new Error(`Measure '${measure.measure}' not found in cube '${entityType.name}'`)
				}
				return measure
			}) ?? []
		}
		if (chartAnnotation.measures.length === 0 && entityType.defaultMeasure) {
			chartAnnotation.measures.push({
				dimension: C_MEASURES,
				measure: entityType.defaultMeasure,
			})
		}

		// Check validation
		if (isEmpty(chartAnnotation.measures)) {
			throw new Error('The measures of chart answer cannot be empty')
		}

		// Temporarily support Column to represent Table
		if (answer.visualType === 'Table') {
			chartAnnotation.chartType = {
				type: ChartTypeEnum.Bar,
				orient: ChartOrient.vertical,
				variant: BarVariant.None
			}
		}

		const slicers = []
		if (answer.variables) {
			slicers.push(...answer.variables.map((slicer) => tryFixVariableSlicer(slicer, entityType)))
		}
		if (answer.slicers) {
			slicers.push(...answer.slicers.map((slicer) => tryFixSlicer(slicer, entityType)))
		}
		if (answer.timeSlicers) {
			const timeSlicers = mapTimeSlicer(answer.timeSlicers)
				.map((slicer) => workOutTimeRangeSlicers(new Date(), slicer, entityType))
				.map((ranges) => toAdvancedFilter(ranges, FilteringLogic.And))
			slicers.push(...timeSlicers)
		}

		const presentationVariant: PresentationVariant = {}
		if (answer.limit) {
			presentationVariant.maxItems = answer.limit
		}
		if (answer.orders) {
			presentationVariant.sortOrder = answer.orders.map(tryFixOrder)
		}
		presentationVariant.groupBy = getEntityDimensions(entityType)
			.filter((property) => !chartAnnotation.dimensions?.some((item) => item.dimension === property.name))
			.map((property) => ({
				dimension: property.name,
				hierarchy: property.defaultHierarchy,
				level: null
			}))

		// ChartTypes
		let chartSettings: ChartSettings = null
		if (chartAnnotation.chartType) {
			const i18n = t('analytics:Tools.ChatBI.ChartTypes', {returnObjects: true})
			const chartTypes = CHART_TYPES.map((_) => ({..._, name: i18n[upperFirst(_.name)]}))
			const index = chartTypes.findIndex(
				({ type, orient }) => type === chartAnnotation.chartType.type && orient === chartAnnotation.chartType.orient
			)
			if (index > -1) {
				chartAnnotation.chartType = chartTypes.splice(index, 1)[0]
			}
			chartSettings = {
				universalTransition: true,
				chartTypes,
				locale: language
			}
		}

		const dataSettings: DataSettings = {
				...answer.dataSettings,
				chartAnnotation,
				presentationVariant,
				calculatedMembers: answer.calculated_members,
				parameters: answer.parameters?.reduce((acc, { name, value }) => {
					acc[name] = value
					return acc
				}, {})
			}
		// In parallel: return to the front-end display and back-end data retrieval
		if (answer.visualType === 'KPI') {
			for (const measure of chartAnnotation.measures) {
				subscriber?.next({
					data: {
						type: ChatMessageTypeEnum.MESSAGE,
						data: {
							id: shortuuid(),
							type: 'component',
							data: {
								category: 'Dashboard',
								type: 'KPI',
								dataSettings: {
									...omit(dataSettings, 'chartAnnotation'),
									KPIAnnotation: {
										DataPoint: {
											Value: measure
										}
									}
								} as DataSettings,
								slicers,
								title: answer.preface,
							} as TMessageComponent,
							xpertName,
							agentKey
						} as TMessageContentComponent
					}
				} as MessageEvent)
			}
		} else {
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: tool_call_id,
				category: 'Dashboard',
				type: 'AnalyticalCard',
				dataSettings,
				chartSettings,
				slicers,
				title: answer.preface,
				indicators,
			} as TMessageComponent)
			// subscriber.next({
			// 	data: {
			// 		type: ChatMessageTypeEnum.MESSAGE,
			// 		data: {
			// 			id: shortuuid(),
			// 			type: 'component',
			// 			data: {
			// 				category: 'Dashboard',
			// 				type: 'AnalyticalCard',
			// 				dataSettings,
			// 				chartSettings,
			// 				slicers,
			// 				title: answer.preface,
			// 				indicators
			// 			} as TMessageComponent,
			// 			xpertName,
			// 			agentKey
			// 		} as TMessageContentComponent
			// 	}
			// } as MessageEvent)
		}

		return new Promise((resolve, reject) => {
			chartService.selectResult().subscribe((result) => {
				if (result.error) {
					reject(result.error)
				} else {
					resolve(extractDataValue(result.data, dataSettings.chartAnnotation, credentials))
				}
				destroy$.next()
				destroy$.complete()
			})

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

	/**
	 * 
	 * @deprecated use `calculated_members` in `ChatAnswer` instead.
	 * 
	 * Create a tool for creating indicator for cube in semantic model.
	 * Responsible for checking the validity of the formula so that LLM can redo it on the spot.
	 *
	 * @param dsCoreService
	 */
	createIndicatorTool(dsCoreService: NgmDSCoreService) {
		return tool(
			async (indicator: Indicator & { cube: string; language: 'zh' | 'en'; query: string}, config: LangGraphRunnableConfig) => {
				this.logger.debug(`[ChatBI] [create_indicator] new indicator: ${JSON.stringify(indicator)}`)
				const toolCallId = config.metadata.tool_call_id

				if (!indicator.formula) {
					throw new Error(`The formula of indicator cannot be empty`)
				}

				await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
					id: toolCallId,
					category: 'Tool',
					message: indicator.name || indicator.code,
				})

				const formula = tryFixFormula(indicator.formula, indicator.code)
				// Checking the validity of formula
				const { language, query } = indicator
				if (query) {
					const statement = `WITH MEMBER [Measures].[${indicator.code}] AS ${formula}\n` + query
					const dataSource = await firstValueFrom(dsCoreService.getDataSource(this.getModelKey(indicator.modelId)))
					const queryResult = await firstValueFrom(dataSource.query({statement, forceRefresh: true}))
					if (queryResult) {
						//
					}
				}

				const _indicator = {...indicator, formula, entity: indicator.cube, visible: true}

				await this.updateIndicators(dsCoreService, [_indicator])
				// Created event
				await this.onCreatedIndicator(_indicator, config?.configurable as TAgentRunnableConfigurable)

				return new Command({
					update: {
						[BIVariableEnum.INDICATORS]: [_indicator],
						// update the message history
						messages: [
							{
								role: 'tool',
								content: `The indicator with code '${indicator.code}' has been created!`,
								tool_call_id: toolCallId
							}
						]
					}
				})
			},
			{
				name: ChatBIToolsEnum.CREATE_INDICATOR,
				description: 'Create a indicator for new measure',
				schema: IndicatorSchema,
				verboseParsingErrors: true
			}
		)
	}

	/**
	 * On created indicator event.
	 * 
	 * @param subscriber 
	 * @param indicator
	 * @param language Language of current chat context
	 */
	async onCreatedIndicator(indicator: IIndicator, configurable: TAgentRunnableConfigurable) {
		const { subscriber, xpertName, agentKey } = configurable ?? {}
		subscriber.next({
			data: {
				type: ChatMessageTypeEnum.MESSAGE,
				data: {
					id: shortuuid(),
					type: 'component',
					data: {
						category: 'Dashboard',
						type: 'NewIndicator',
						indicator
					} as TMessageComponent,
					xpertName,
					agentKey
				} as TMessageContentComponent
			}
		} as MessageEvent)
	}
}
