import { tool } from '@langchain/core/tools'
import { ChatMessageTypeEnum, JSONValue } from '@metad/contracts'
import { shortuuid } from '@metad/server-common'
import { z } from 'zod'
import { ChatBIContext } from '../types'

export function createShowIndicatorsTool(context: ChatBIContext) {
	const { dsCoreService } = context

	return tool(
		async (
			{ dataSource, indicators }: { dataSource: string; indicators: { indicator: string; cube: string }[] },
			config
		): Promise<string> => {
			const { configurable } = config ?? {}
			const { subscriber } = configurable ?? {}

			// console.log(dataSource, indicators)

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
			name: 'show_indicators',
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