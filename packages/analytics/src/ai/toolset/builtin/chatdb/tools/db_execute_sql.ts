import { tool, ToolRunnableConfig } from '@langchain/core/tools'
import { z } from 'zod'
import { ChatDBToolEnum } from '../types'
import { ChatDBToolset } from '../chatdb'
import { QuerySqlCommand } from '../../../../../data-source/commands'

export function buildExecuteSQLTool(toolset: ChatDBToolset) {
    const commandBus = toolset.commandBus
	return tool(
		async (_, config: ToolRunnableConfig) => {
            const result = await commandBus.execute(new QuerySqlCommand({
                dataSource: toolset.getCredentials().dataSource,
                schema: toolset.getCredentials().schema,
				statement: _.statement
            }))

			return result.status === 'OK' || result.data?.length ? JSON.stringify(result, null, 2) :
			  result.error || 'No data was found when executing this statement'
		},
		{
			name: ChatDBToolEnum.ExecuteSQL,
			description: 'Execute SQL statement in the connected database.',
            schema: z.object({
				statement: z.string().describe('SQL statement to execute.')
            }),
			verboseParsingErrors: true
		}
	)
}
