import { Tool, tool } from '@langchain/core/tools'
import { getContextVariable } from "@langchain/core/context";
import { ChatMessageTypeEnum, IChatBIModel, JSONValue, OrderTypeEnum, TStateVariable, TToolCredentials } from '@metad/contracts'
import {
	ChartBusinessService,
	ChartSettings,
	DataSettings,
	DSCoreService,
	EntityType,
	FilteringLogic,
	getEntityDimensions,
	getEntityHierarchy,
	getEntityProperty,
	getPropertyHierarchy,
	isEntitySet,
	isIndicatorMeasureProperty,
	markdownModelCube,
	PresentationVariant,
	toAdvancedFilter,
	tryFixDimension,
	tryFixSlicer,
	tryFixVariableSlicer,
	workOutTimeRangeSlicers
} from '@metad/ocap-core'
import {
	BuiltinToolset,
	ToolNotSupportedError,
	ToolProviderCredentialValidationError
} from '@metad/server-ai'
import { getErrorMessage, omit, race, shortuuid, TimeoutError } from '@metad/server-common'
import { firstValueFrom, Subject, Subscriber, switchMap, takeUntil } from 'rxjs'
import { In } from 'typeorm'
import { z } from 'zod'
import { ChatAnswerSchema, GetBIContextQuery, TBIContext } from '../../../../chatbi'
import { ChatAnswer } from '../../../../chatbi/tools'
import { DimensionMemberRetrieverToolQuery } from '../../../../model-member/queries'
import { registerSemanticModel } from '../../../../model/ocap'
import { CHART_TYPES, ChatBIContext, fixMeasure, TChatBICredentials, tryFixChartType } from './types'
import { markdownCubes } from '../../../../chatbi/graph'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'

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

	getVariables() {
		return [
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
		]
	}

	async initTools() {
		if (!this.toolset) {
			throw new ToolNotSupportedError(`Toolset not provided for '${this.constructor.prototype.provider}'`)
		}
		const tools = this.toolset.tools.filter((_) => _.enabled)

		if (!tools.length) {
			throw new ToolNotSupportedError(`Tools not be enabled for '${this.constructor.prototype.provider}'`)
		}

		this.biContext = await this.queryBus.execute<GetBIContextQuery, TBIContext>(new GetBIContextQuery())
		this.models = await this.registerChatModels(this.toolset.credentials.models)

		this.tools = []
		if (tools.find((_) => _.name === 'get_available_cubes')) {
			this.tools.push(this.createGetAvailableCubes() as unknown as Tool)
		}
		if (tools.find((_) => _.name === 'get_cube_context')) {
			this.tools.push(this.createCubeContextTool(this.dsCoreService) as unknown as Tool)
		}
		// if (tools.find((_) => _.name === 'show_indicators')) {
		// 	this.tools.push(
		// 		createShowIndicatorsTool({
		// 			dsCoreService: this.dsCoreService,
		// 			entityType: null
		// 		}) as unknown as Tool
		// 	)
		// }
		// if (tools.find((_) => _.name === 'answer_question')) {
		// 	this.tools.push(
		// 		this.createChatAnswerTool({
		// 			dsCoreService: this.dsCoreService,
		// 			entityType: null
		// 		}) as unknown as Tool
		// 	)
		// }
		if (tools.find((_) => _.name === 'dimension_member_retriever')) {
			const dimensionMemberRetrieverTool = await this.queryBus.execute(
				new DimensionMemberRetrieverToolQuery(
					'dimension_member_retriever',
					this.toolset.tenantId,
					this.toolset.organizationId
				)
			)
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

		return items
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
				try {
					return await race(maximumWaitTime, async () => {
						const cubes = []
						for await (const item of [{ modelId, name }]) {
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

						// Fetch a context variable named "currentState".
						// We have set this variable explicitly in each ToolNode invoke method that calls this tool.
						const currentState = getContextVariable("currentState");

						// Populated when a tool is called with a tool call from a model as input
						const toolCallId = config.metadata.tool_call_id;
						return new Command({
							update: {
								chatbi_cubes: cubes,
								chatbi_cubes_context: cubesReducer(currentState.chatbi_cubes, cubes).map(({context}) => context).join('\n\n'),
								// update the message history
								messages: [
									{
										role: "tool",
										content: cubes.map(({context}) => context).join('\n\n'),
										tool_call_id: toolCallId,
									},
								],
							},
						})
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

	createChatAnswerTool(context: ChatBIContext, credentials: TChatBICredentials) {
		const { dsCoreService } = context
		const { dataPermission } = credentials

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
						const { data, members } = await this.drawChartMessage(
							answer as ChatAnswer,
							{ ...context, entityType },
							subscriber,
						)

						// Max limit 20 members
						let results = ''
						if (dataPermission) {
							results = data ? JSON.stringify(Object.values(data).slice(0, 20)) : 'Empty'
						} else {
							if (members) {
								Object.keys(members).forEach((key) => {
									results += `Members of dimension '${key}':]\n`
									results += Object.values(members[key]).slice(0, 20).map((member) => JSON.stringify(member)).join('\n')
									results += '\n\n'
								})
							} else {
								results = 'Empty'
							}
						}

						return `The data are:\n${results}\n`
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
			}
		)
	}

	drawChartMessage(answer: ChatAnswer, context: ChatBIContext, subscriber: Subscriber<MessageEvent>,): Promise<any> {
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

			// In parallel: return to the front-end display and back-end data retrieval
			if (answer.visualType === 'KPI') {
				let indicator = null
				const measure = chartAnnotation.measures[0]
				const measureProperty = getEntityProperty(entityType, measure)
				if (isIndicatorMeasureProperty(measureProperty)) {
					indicator = measureProperty.name
				}
				subscriber?.next({
					data: {
						type: ChatMessageTypeEnum.MESSAGE,
						data: {
							id: shortuuid(),
							type: 'component',
							data: {
								type: 'KPI',
								dataSettings: {
									...omit(dataSettings, 'chartAnnotation'),
									KPIAnnotation: {
										DataPoint: {
											Value: chartAnnotation.measures[0]
										}
									}
								} as DataSettings,
								slicers,
								title: answer.preface,
								indicator
							} as unknown as JSONValue
						}
					}
				} as MessageEvent)
			} else {
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.MESSAGE,
						data: {
							id: shortuuid(),
							type: 'component',
							data: {
								type: 'AnalyticalCard',
								dataSettings,
								chartSettings,
								slicers,
								title: answer.preface
							} as unknown as JSONValue
						}
					}
				} as MessageEvent)
			}

			chartService.selectResult().subscribe((result) => {
				if (result.error) {
					reject(result.error)
				} else {
					resolve({ data: result.data, members: figureOutMembers(result.data, dataSettings, entityType) })
				}
				destroy$.next()
				destroy$.complete()
			})

			// chartService.selectResult()

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

function figureOutMembers(data: any[], dataSettings: DataSettings, entityType: EntityType) {
	const dimensions = dataSettings.chartAnnotation?.dimensions
	if (data && dimensions) {
		const categoryMembers = {}
		dimensions.forEach((dimension) => {
			categoryMembers[dimension.dimension] = {}
			const hierarchy = getPropertyHierarchy(dimension)
			const property = getEntityHierarchy(entityType, hierarchy)
			const caption = property.memberCaption
			data.forEach((item, index) => {
				categoryMembers[dimension.dimension][data[index][property.name]] = {
					key: data[index][property.name],
					caption: data[index][caption],
				}
			})
		})

		return categoryMembers
	}

	return null
}