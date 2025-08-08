import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, getToolCallIdFromConfig, TMessageComponent } from '@metad/contracts'
import { C_MEASURES, DataSettings, getEntityCalendar, getEntityProperty } from '@metad/ocap-core'
import { t } from 'i18next'
import { groupBy } from 'lodash'
import { firstValueFrom } from 'rxjs'
import { z } from 'zod'
import { ChatBIContext, TChatBICredentials } from '../types'

export function createShowIndicatorsTool(context: ChatBIContext, credentials: TChatBICredentials) {
	const { chatbi, dsCoreService } = context
	const { dataPermission } = credentials

	return tool(
		async (
			{ modelId, indicators }: { modelId: string; indicators: { indicator: string; cube: string }[] },
			config
		): Promise<string> => {
			const _dataSource = await dsCoreService._getDataSource(modelId)
			const cubes = groupBy(indicators, 'cube')
			for await (const cube of Object.keys(cubes)) {
				const entityType = await firstValueFrom(_dataSource.selectEntityType(cube))
				if (entityType instanceof Error) {
					throw entityType
				}

				for await (const indicator of cubes[cube]) {
					const _indicator = _dataSource.getIndicator(indicator.indicator, indicator.cube)
					if (!_indicator) {
						const property = getEntityProperty(entityType, indicator.indicator)
						if (!property) {
							if (!property) {
								throw new Error(
									t('analytics:Error.IndicatorNotFound', { indicator: indicator.indicator })
								)
							}
						}
					}
				}

				const toolCallId = getToolCallIdFromConfig(config)
				try {
					const { dimension, hierarchy, level } = getEntityCalendar(entityType)
					// Tool message event
					await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
						id: toolCallId,
						category: 'Dashboard',
						type: 'Indicators',
						indicators: cubes[cube].map((indicator) => ({
							...indicator,
							dataSource: modelId,
							entitySet: indicator.cube,
							indicatorCode: indicator.indicator
						}))
					} as TMessageComponent)
				} catch (err) {
					for await (const indicator of cubes[cube]) {
						await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
							id: toolCallId,
							category: 'Dashboard',
							type: 'KPI',
							dataSettings: {
								dataSource: modelId,
								entitySet: cube,
								KPIAnnotation: {
									DataPoint: {
										Value: {
											dimension: C_MEASURES,
											measure: indicator.indicator
										}
									}
								}
							} as DataSettings
						} as TMessageComponent)
					}
				}
			}

			return `The detailed data of the indicator list has been visually presented to the user, and you do not need to repeat the indicator information.`
		},
		{
			name: 'show_indicators',
			description: `This tool can visually display detailed data of indicators to users, so you don’t have to repeat the indicator information.`,
			schema: z.object({
				modelId: z.string().describe(`ModelId of the cube to which the indicator belongs`),
				indicators: z.array(
					z.object({
						cube: z.string().describe(`Cube to which is the indicator belongs`),
						indicator: z.string().describe(`The code of indicator, or the name of measure`)
					})
				)
			})
		}
	)
}
