import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { BuiltinToolset, ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { CreateToolsetCommand } from '../create-toolset.command'

@CommandHandler(CreateToolsetCommand)
export class CreateToolsetHandler implements ICommandHandler<CreateToolsetCommand> {
	readonly #logger = new Logger(CreateToolsetHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly toolsetRegistry: ToolsetRegistry
	) {}

	public async execute(command: CreateToolsetCommand): Promise<BuiltinToolset> {
		const strategy = this.toolsetRegistry.get(command.toolset.type)
		if (!strategy) {
			return null
		}

		return strategy.create(command.toolset)
	}
}
