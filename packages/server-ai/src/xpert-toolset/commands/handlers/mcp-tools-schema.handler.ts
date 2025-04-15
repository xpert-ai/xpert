import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { createMCPClient } from '../../provider/mcp/types'
import { ToolSchemaParser } from '../../utils/parser'
import { MCPToolsBySchemaCommand } from '../mcp-tools-schema.command'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { createProMCPClient } from '../../provider/mcp/pro'

@CommandHandler(MCPToolsBySchemaCommand)
export class MCPToolsBySchemaHandler implements ICommandHandler<MCPToolsBySchemaCommand> {
	readonly #logger = new Logger(MCPToolsBySchemaHandler.name)

	constructor(
		private readonly toolsetService: XpertToolsetService,
		private readonly commandBus: CommandBus) {}

	public async execute(command: MCPToolsBySchemaCommand): Promise<any> {
		const schema = JSON.parse(command.toolset.schema)

		// Create a client
		const {client, destroy} = this.toolsetService.isPro() ? await createProMCPClient(command.toolset, null, this.commandBus, schema)
			: await createMCPClient(command.toolset.id, schema)
		
		try {
			const tools = await client.getTools()
			return {
				tools: tools.map((tool) => {
					return {
						name: tool.name,
						description: tool.description,
						schema: ToolSchemaParser.parseZodToJsonSchema(tool.schema)
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
