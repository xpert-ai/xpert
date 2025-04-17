import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { createMCPClient } from '../../provider/mcp/types'
import { ToolSchemaParser } from '../../utils/parser'
import { MCPToolsBySchemaCommand } from '../mcp-tools-schema.command'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { createProMCPClient } from '../../provider/mcp/pro'
import { EnvStateQuery } from '../../../environment'
import { DynamicStructuredTool } from '@langchain/core/tools'

@CommandHandler(MCPToolsBySchemaCommand)
export class MCPToolsBySchemaHandler implements ICommandHandler<MCPToolsBySchemaCommand> {
	readonly #logger = new Logger(MCPToolsBySchemaHandler.name)

	constructor(
		private readonly toolsetService: XpertToolsetService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	public async execute(command: MCPToolsBySchemaCommand): Promise<any> {
		const schema = JSON.parse(command.toolset.schema)
		const envState = await this.queryBus.execute(new EnvStateQuery(command.toolset.workspaceId))

		// Create a client
		const {client, destroy} = this.toolsetService.isPro()
			? await createProMCPClient(command.toolset, null, this.commandBus, schema, envState)
			: await createMCPClient(command.toolset.id, schema, envState)
		
		try {
			const tools = await client.getTools()
			return {
				tools: tools.map((tool) => {
					(<DynamicStructuredTool>tool).verboseParsingErrors = true;
					return {
						name: tool.name,
						description: tool.description,
						schema: (<DynamicStructuredTool>tool).lc_kwargs?.schema ??
							ToolSchemaParser.parseZodToJsonSchema(tool.schema)
					}
				})
			}
		} finally {
			if (destroy) {
				destroy().catch((err) => this.#logger.debug(err))
			}
			client.close().catch((err) => this.#logger.debug(err))
		}
	}
}
