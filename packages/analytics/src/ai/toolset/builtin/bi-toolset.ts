import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { getContextVariable } from '@langchain/core/context'
import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	CONTEXT_VARIABLE_CURRENTSTATE,
	getToolCallIdFromConfig,
	IIndicator,
} from '@metad/contracts'
import {
	DSCoreService,
	EntityType,
	Indicator,
	isEntitySet,
	markdownModelCube,
	omit,
	Schema,
	TimeGranularity,
	TimeRangesSlicer,
	TimeRangeType
} from '@metad/ocap-core'
import { race, TimeoutError } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { Cache } from 'cache-manager'
import { t } from 'i18next'
import { groupBy } from 'lodash'
import { firstValueFrom, switchMap } from 'rxjs'
import { z } from 'zod'
import { TBIContext } from '../../types'

export enum BIToolsEnum {
	GET_CUBE_CONTEXT = 'get_cube_context',
	SHOW_INDICATORS = 'show_indicators'
}

export enum BIVariableEnum {
	CurrentCubeContext = 'current_cube_context',
	INDICATORS = 'chatbi_indicators'
}

const MaximumWaitTime = 3000

/**
 * Create tool for get context of cube.
 *
 * @param dsCoreService
 * @returns
 */
export function createCubeContextTool(toolName: string, context: TBIContext) {
	const { dsCoreService, cacheManager, logger } = context

	return tool(
		async (item, config: LangGraphRunnableConfig) => {
			logger.debug(`Tool '${toolName}' params:`, item.modelId, item.name)
			const toolCallId = getToolCallIdFromConfig(config)
			// Tool message event
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCallId,
				category: 'Tool',
				message: item.name
			})
			try {
				// Fetch a context variable named "currentState".
				// We have set this variable explicitly in each ToolNode invoke method that calls this tool.
				const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE)

				return await race(MaximumWaitTime, async () => {
					logger.debug(`Start get context for (modelId='${item.modelId}', cube='${item.name}')`)

					let entityType = await getCubeCache(cacheManager, item.modelId, item.name)
					if (!entityType) {
						// Update runtime indicators
						const indicators = currentState?.[BIVariableEnum.INDICATORS]
						if (indicators) {
							await updateOcapIndicators(dsCoreService, indicators, {logger})
						}

						// Fetch EntityType for cube
						const entitySet = await firstValueFrom(
							dsCoreService
								.getDataSource(item.modelId)
								.pipe(switchMap((dataSource) => dataSource.selectEntitySet(item.name)))
						)
						if (isEntitySet(entitySet)) {
							entityType = entitySet.entityType
							await setCubeCache(cacheManager, item.modelId, item.name, entityType)
						} else {
							logger.error(`Get context error: `, entitySet.message)
						}
					}

					const context = markdownModelCube({
						modelId: item.modelId,
						dataSource: item.modelId,
						cube: entityType
					})

					// Populated when a tool is called with a tool call from a model as input
					return new Command({
						update: {
							[BIVariableEnum.CurrentCubeContext]: context,
							// update the message history
							messages: [
								new ToolMessage({
									content: context,
									tool_call_id: toolCallId
								})
							]
						}
					})
				})
			} catch (err) {
				if (err instanceof TimeoutError) {
					throw new Error(
						`Timeout for getting context of cube '${item.name}' in model '${item.modelId}', please confirm whether the model information is correct.`
					)
				}
				throw err
			}
		},
		{
			name: toolName,
			description: 'Get the context info for the cube',
			schema: z.object({
				modelId: z.string().describe('The model id of cube'),
				name: z.string().describe('The name of cube')
			})
		}
	)
}

/**
 * Get EntityType of cube from cache
 *
 * @param modelId Semantic Model ID
 * @param cubeName Name of cube
 * @returns EntityType
 */
async function getCubeCache(cacheManager: Cache, modelId: string, cubeName: string) {
	return await cacheManager.get<EntityType>('chatbi:' + modelId + '/' + cubeName)
}

/**
 * Save EntityType of cube in cache
 *
 * @param modelId Semantic Model ID
 * @param cubeName Name of cube
 * @param data EntityType
 */
async function setCubeCache(cacheManager: Cache, modelId: string, cubeName: string, data: EntityType): Promise<void> {
	await cacheManager.set('chatbi:' + modelId + '/' + cubeName, data)
}

/**
 * Update new indicators for semantic model in data source.
 *
 * @param dsCoreService Data source service
 * @param indicators New indicators
 */
export async function updateOcapIndicators(dsCoreService: DSCoreService, indicators: IIndicator[], params: {logger?: Logger; isDraft?: boolean}) {
	const { logger, isDraft } = params ?? {}
	const _indicators = indicators.map((_) => {
		const indicator = (isDraft && _.draft
						? {
								..._,
								..._.draft,
								...(_.draft.options ?? {})
							}
						: {
								..._,
								...(_.options ?? {})
							}) as Indicator
		if (!indicator.modelId) {
			throw new Error(t('analytics:Error.IndicatorModelIdRequired', { indicator: _.code }))
		}
		return indicator
	})
	const models = groupBy(_indicators, 'modelId')
	for await (const modelId of Object.keys(models)) {
		const indicators = models[modelId]
		const modelKey = modelId
		const dataSource = await firstValueFrom(dsCoreService.getDataSource(modelKey))
		const schema = dataSource.options.schema
		const _indicators = [...(schema?.indicators ?? [])].filter(
			(indicator) => !indicators.some((item) => item.id === indicator.id && item.code === indicator.code)
		)
		_indicators.push(...indicators)

		logger?.verbose(
			`Set New indicators for dataSource ${dataSource.id}: ${JSON.stringify(_indicators.map((indicator) => indicator.code))}`
		)

		dataSource.setSchema({
			...(dataSource.options.schema ?? {}),
			indicators: _indicators
		} as Schema)
	}
}


export type TTimeSlicerParam = {
	dimension: string
	hierarchy: string
	granularity: TimeGranularity
	start: string
	end: string
}

export function mapTimeSlicer(param: TTimeSlicerParam[]): TimeRangesSlicer[] {
  return param?.map((_) => {
	return {
		dimension: {
			dimension: _.dimension,
			hierarchy: _.hierarchy,
		},
		currentDate: 'TODAY',
		ranges: [
			{
				...omit(_, 'dimension', 'hierarchy'),
				type: TimeRangeType.Standard,
			}
		]
	}
  })
}