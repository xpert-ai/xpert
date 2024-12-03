import { Tool, tool } from '@langchain/core/tools'
import {
	ChatGatewayEvent,
	ChatGatewayMessage,
	ChatMessageTypeEnum,
	IXpertToolset,
	JSONValue,
	OrderTypeEnum,
	TToolCredentials
} from '@metad/contracts'
import {
	assignDeepOmitBlank,
	C_MEASURES,
	ChartBusinessService,
	ChartMeasure,
	ChartOrient,
	ChartSettings,
	ChartType,
	ChartTypeEnum,
	cloneDeep,
	DataSettings,
	DSCoreService,
	EntityType,
	FilteringLogic,
	getChartType,
	getEntityDimensions,
	isEntitySet,
	markdownModelCube,
	PieVariant,
	PresentationVariant,
	toAdvancedFilter,
	tryFixDimension,
	tryFixSlicer,
	tryFixVariableSlicer,
	workOutTimeRangeSlicers
} from '@metad/ocap-core'
import {
	BuiltinToolset,
	TBuiltinToolsetParams,
	ToolNotSupportedError,
	ToolProviderCredentialValidationError
} from '@metad/server-ai'
import { getErrorMessage, omit, race, shortuuid, TimeoutError } from '@metad/server-common'
import { upperFirst } from 'lodash'
import { firstValueFrom, Subject, switchMap, takeUntil } from 'rxjs'
import { In } from 'typeorm'
import { z } from 'zod'
import { ChatAnswerSchema, GetBIContextQuery, TBIContext } from '../../../../chatbi'
import { markdownCubes } from '../../../../chatbi/graph'
import { ChatAnswer } from '../../../../chatbi/tools'
import { registerSemanticModel } from '../../../../model/ocap'
import { DimensionMemberRetrieverToolQuery } from '../../../../model-member/queries'

export class ChatBIToolset extends BuiltinToolset {
	static provider = 'chatbi'

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

	private cubes: string

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams
	) {
		super(ChatBIToolset.provider, toolset, params)
	}

	async initTools() {
		if (!this.toolset) {
			throw new ToolNotSupportedError(`Toolset not provided for '${ChatBIToolset.provider}'`)
		}
		const tools = this.toolset.tools.filter((_) => _.enabled)

		if (!tools.length) {
			throw new ToolNotSupportedError(`Tools not be enabled for '${ChatBIToolset.provider}'`)
		}

		this.biContext = await this.queryBus.execute<GetBIContextQuery, TBIContext>(new GetBIContextQuery())
		this.cubes = await this.registerChatModels(this.toolset.credentials.models)

		this.tools = []
		if (tools.find((_) => _.name === 'get_available_cubes')) {
			this.tools.push(
				this.createGetAvailableCubes() as unknown as Tool,
			)
		}
		if (tools.find((_) => _.name === 'get_cube_context')) {
			this.tools.push(
				this.createCubeContextTool(this.dsCoreService) as unknown as Tool,
			)
		}
		if (tools.find((_) => _.name === 'answer_question')) {
			this.tools.push(
				this.createChatAnswerTool({
					dsCoreService: this.dsCoreService,
					entityType: null
				}) as unknown as Tool,
			)
		}
		if (tools.find((_) => _.name === 'dimension_member_retriever')) {
			const dimensionMemberRetrieverTool = await this.queryBus.execute(new DimensionMemberRetrieverToolQuery(
				'dimension_member_retriever',
				this.toolset.tenantId,
				this.toolset.organizationId,
			))
			this.tools.push(dimensionMemberRetrieverTool)
		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			const models = credentials.models

			console.log(credentials)
		} catch (e) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(e))
		}
	}

	async registerChatModels(models: string[]) {
		const { items } = await this.modelService.findAll({
			where: { tenantId: this.tenantId, organizationId: this.organizationId, id: In(models) },
			relations: [
				'model',
				'model.dataSource',
				'model.dataSource.type',
				'model.roles',
				'model.indicators',
				'xperts'
			],
			order: {
				visits: OrderTypeEnum.DESC
			}
		})

		// Register all models
		items.forEach((item) => registerSemanticModel(item.model, this.dsCoreService))

		return markdownCubes(items)
	}

	createGetAvailableCubes() {
		return tool(
			async () => {
				return this.cubes
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
			async ({ modelId, name }): Promise<string> => {

				this.logger.debug(`Tool 'get_cube_context' params:`, modelId, name)
				try {
					return await race(maximumWaitTime, async () => {
						let context = ''
						for await (const item of [{modelId, name}]) {
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
					})
				} catch (err) {
					if (err instanceof TimeoutError) {
						return `Error: Timeout for getting cube context, please confirm whether the model information is correct.`
					} else {
						return `Error: ` + getErrorMessage(err)
					}
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

	createChatAnswerTool(context: ChatBIContext) {
		const { dsCoreService } = context

		return tool(
			async (answer: any, config): Promise<string> => {
				const { configurable } = config ?? {}
				const { subscriber } = configurable ?? {}
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
							{ ...context, entityType },
							subscriber
						)
						// Max limit 100 members
						const members = data ? JSON.stringify(Object.values(data).slice(0, 100)) : 'Empty'

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
				name: 'answer_question',
				description: 'Show chart answer for the question to user',
				schema: ChatAnswerSchema,
				verboseParsingErrors: true
			},
		)
	}

	drawChartMessage(answer: ChatAnswer, context: ChatBIContext, subscriber): Promise<any> {
		const { dsCoreService, entityType } = context
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

	async getCubeCache(modelId: string, cubeName: string) {
		return await this.cacheManager.get<EntityType>(modelId + '/' + cubeName)
	}
	async setCubeCache(modelId: string, cubeName: string, data: EntityType): Promise<void> {
		await this.cacheManager.set(modelId + '/' + cubeName, data)
	}
}

type ChatBIContext = {
	dsCoreService: DSCoreService
	entityType: EntityType
	// subscriber: Subscriber<any>
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
