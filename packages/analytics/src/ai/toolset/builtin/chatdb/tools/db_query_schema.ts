import { tool, ToolRunnableConfig } from '@langchain/core/tools'
import { z } from 'zod'
import { ChatDBToolEnum } from '../types'
import { ChatDBToolset } from '../chatdb'
import { QuerySchemaCommand } from '../../../../../data-source/commands'

export function buildQuerySchemaTool(toolset: ChatDBToolset) {
    const commandBus = toolset.commandBus
	return tool(
		async (_, config: ToolRunnableConfig) => {
            const tables = await commandBus.execute(new QuerySchemaCommand({
                dataSource: toolset.getCredentials().dataSource,
                schema: toolset.getCredentials().schema,
				tables: _.tables
            }))
			return tables.length ? JSON.stringify(tables, null, 2) : 'No tables found'
		},
		{
			name: ChatDBToolEnum.QuerySchema,
			description: 'Query schema of tables in the connected database.',
            schema: z.object({
				tables: z.array(z.string()).min(1).describe('Array of one or more table names to query the schema.')
            }),
			verboseParsingErrors: true
		}
	)
}
