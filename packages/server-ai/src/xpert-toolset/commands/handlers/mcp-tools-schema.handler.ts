import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { MCPToolsBySchemaCommand } from '../mcp-tools-schema.command'

@CommandHandler(MCPToolsBySchemaCommand)
export class MCPToolsBySchemaHandler implements ICommandHandler<MCPToolsBySchemaCommand> {
	readonly #logger = new Logger(MCPToolsBySchemaHandler.name)

	constructor(private readonly commandBus: CommandBus) {}

	public async execute(command: MCPToolsBySchemaCommand): Promise<any> {
		const schema = command.schema

		console.log(schema)

		// Create a client
		const client = new MultiServerMCPClient()

		// Connect to a remote server via SSE
		for await (const name of Object.keys(schema.servers)) {
			const server = schema.servers[name]
			await client.connectToServerViaSSE(
				name, // Server name
				server.url // SSE endpoint URL
			)
		}

		return {
			tools: client.getTools().map((tool) => {
				return {
					name: tool.name,
					description: tool.description
				}
			})
		}
	}
}
