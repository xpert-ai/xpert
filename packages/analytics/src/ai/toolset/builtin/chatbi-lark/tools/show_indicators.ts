import { tool } from '@langchain/core/tools'
import { ChatMessageTypeEnum, JSONValue } from '@metad/contracts'
import { shortuuid } from '@metad/server-common'
import { z } from 'zod'
import { ChatBILarkContext } from '../types'
import { ChatBIToolsEnum } from '../../chatbi/types'

export function createShowIndicatorsTool(context: ChatBILarkContext) {
	const { dsCoreService, logger } = context

	return tool(
		async (
			{ dataSource, indicators }: { dataSource: string; indicators: { indicator: string; cube: string }[] },
			config
		): Promise<string> => {
			const { configurable } = config ?? {}
			const { subscriber } = configurable ?? {}

			subscriber?.next({
				data: {
					type: ChatMessageTypeEnum.MESSAGE,
					data: {
						id: shortuuid(),
						type: 'component',
						data: {
							type: 'Indicators',
							indicators: indicators.map((indicator) => ({
								...indicator,
								dataSource,
								entitySet: indicator.cube
							}))
						} as unknown as JSONValue
					}
				}
			} as MessageEvent)

			return JSON.stringify(indicators)
		},
		{
			name: ChatBIToolsEnum.SHOW_INDICATORS,
			description: `Show indicators list`,
			schema: z.object({
				dataSource: z.string().describe(`The dataSource of indicators`),
				indicators: z.array(
					z.object({
						cube: z.string().describe(`Entity which is the indicator belong to`),
						indicator: z.string().describe(`The code or id of indicator`)
					})
				)
			})
		}
	)
}
