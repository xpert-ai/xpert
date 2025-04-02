import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { createMCPClient } from '../../provider/mcp/types'
import { ToolSchemaParser } from '../../utils/parser'
import { MCPToolsBySchemaCommand } from '../mcp-tools-schema.command'

@CommandHandler(MCPToolsBySchemaCommand)
export class MCPToolsBySchemaHandler implements ICommandHandler<MCPToolsBySchemaCommand> {
	readonly #logger = new Logger(MCPToolsBySchemaHandler.name)

	constructor(private readonly commandBus: CommandBus) {}

	public async execute(command: MCPToolsBySchemaCommand): Promise<any> {
		const schema = JSON.parse(command.toolset.schema)

		// Create a client
		const {client} = await createMCPClient(command.toolset.id, schema)

		try {
			return {
				tools: client.getTools().map((tool) => {
					return {
						name: tool.name,
						description: tool.description,
						schema: ToolSchemaParser.parseZodToJsonSchema(tool.schema)
					}
				})
			}
		} finally {
			// destroy().catch((err) => this.#logger.debug(err))
			client.close().catch((err) => this.#logger.debug(err))
		}
	}
}
