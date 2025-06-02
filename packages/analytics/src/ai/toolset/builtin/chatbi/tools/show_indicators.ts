import { tool } from '@langchain/core/tools'
import {
	ChatMessageTypeEnum,
	mapTranslationLanguage,
	TMessageComponent,
	TMessageContentComponent
} from '@metad/contracts'
import { C_MEASURES, DataSettings, getEntityCalendar, getEntityProperty } from '@metad/ocap-core'
import { shortuuid } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { groupBy } from 'lodash'
import { firstValueFrom } from 'rxjs'
import { z } from 'zod'
import { ChatBIContext, TChatBICredentials } from '../types'

export function createShowIndicatorsTool(context: ChatBIContext, credentials: TChatBICredentials) {
	const { chatbi, dsCoreService } = context
	const { dataPermission } = credentials

	return tool(
		async (
			{ dataSource, indicators }: { dataSource: string; indicators: { indicator: string; cube: string }[] },
			config
		): Promise<string> => {
			const { configurable } = config ?? {}
			const { subscriber, xpertName, agentKey } = configurable ?? {}

			const _dataSource = await dsCoreService._getDataSource(dataSource)
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
							throw new Error(
								await chatbi.translate('analytics.Error.IndicatorNotFound', {
									lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
									args: { indicator: indicator.indicator }
								})
							)
						}
					}
				}

				try {
					const { dimension, hierarchy, level } = getEntityCalendar(entityType)
					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.MESSAGE,
							data: {
								id: shortuuid(),
								type: 'component',
								data: {
									category: 'Dashboard',
									type: 'Indicators',
									indicators: cubes[cube].map((indicator) => ({
										...indicator,
										dataSource,
										entitySet: indicator.cube,
										indicatorCode: indicator.indicator
									}))
								} as TMessageComponent,
								xpertName,
								agentKey
							} as TMessageContentComponent
						}
					} as MessageEvent)
				} catch (err) {
					for await (const indicator of cubes[cube]) {
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.MESSAGE,
								data: {
									id: shortuuid(),
									type: 'component',
									data: {
										category: 'Dashboard',
										type: 'KPI',
										dataSettings: {
											dataSource,
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
									} as TMessageComponent,
									xpertName,
									agentKey
								} as TMessageContentComponent
							}
						} as MessageEvent)
					}
				}
			}

			return JSON.stringify(indicators)
		},
		{
			name: 'show_indicators',
			description: `Show indicators list`,
			schema: z.object({
				dataSource: z.string().describe(`The dataSource of indicators`),
				indicators: z.array(
					z.object({
						cube: z.string().describe(`Entity which is the indicator belong to`),
						indicator: z.string().describe(`The name of indicator, or the name of measure`)
					})
				)
			})
		}
	)
}
