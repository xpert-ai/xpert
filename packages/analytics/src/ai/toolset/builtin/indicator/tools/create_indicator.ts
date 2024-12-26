import { tool } from '@langchain/core/tools'
import { nanoid } from '@metad/copilot'
import { z } from 'zod'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import { getContextVariable } from '@langchain/core/context'
import { IndicatorToolContext, IndicatorToolsEnum } from '../types'
import { CONTEXT_VARIABLE_CURRENTSTATE } from '@metad/contracts'

export function createIndicatorTool(context: IndicatorToolContext) {
	const { logger, conversation } = context

	return tool(
		async (indicator, config: LangGraphRunnableConfig) => {
			logger.debug(`[ChatBI] [Copilot Tool] [createFormula]: ${JSON.stringify(indicator)}`)

			const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE);

			try {

				// Populated when a tool is called with a tool call from a model as input
				const toolCallId = config.metadata.tool_call_id;
				const key = nanoid()
				return new Command({
					update: {
						'tool.indicators': [indicator],
						// update the message history
						messages: [
							{
								role: "tool",
								content: `The new calculated measure with code '${indicator.code}' has been created!`,
								tool_call_id: toolCallId,
							},
						],
					},
				})
			} catch (err: any) {
				logger.error(err)
				return `Error: ${err.message}`
			}
		},
		{
			name: IndicatorToolsEnum.CREATE_INDICATOR,
			description: 'Create a indicator for new measure',
			schema: z.object({
				modelId: z.string().describe('The id of model'),
				cube: z.string().describe('The cube name'),
				code: z.string().describe('The unique code of indicator'),
				name: z.string().describe(`The caption of indicator in user's language`),
				formula: z.string().describe('The MDX formula for calculated measure'),
				unit: z.string().optional().describe('The unit of measure'),
				description: z
					.string()
					.describe(
						'The detail description of calculated measure, business logic and cube info for example: the time dimensions, measures or dimension members involved'
					)
			})
		}
	)
}
