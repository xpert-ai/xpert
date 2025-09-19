import { tool, ToolRunnableConfig } from '@langchain/core/tools'
import { z } from 'zod'
import { ChatDBToolEnum } from '../types'
import { ChatDBToolset } from '../chatdb'
import { ListTablesCommand } from '../../../../../data-source/commands'

export function buildListTablesTool(toolset: ChatDBToolset) {
    const commandBus = toolset.commandBus
	return tool(
		async (_, config: ToolRunnableConfig) => {
            const tables = await commandBus.execute(new ListTablesCommand({
                dataSource: toolset.getCredentials().dataSource,
                schema: toolset.getCredentials().schema
            }))
			return tables.length ? JSON.stringify(tables, null, 2) : 'No tables found'
		},
		{
			name: ChatDBToolEnum.ListTables,
			description: 'List all tables in the connected database.',
            schema: z.object({

            }),
			verboseParsingErrors: true
		}
	)
}
