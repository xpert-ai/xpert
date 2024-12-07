import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionDelCommand } from '../execution-delete.command'

@CommandHandler(XpertAgentExecutionDelCommand)
export class XpertAgentExecutionDelHandler implements ICommandHandler<XpertAgentExecutionDelCommand> {
	readonly #logger = new Logger(XpertAgentExecutionDelHandler.name)

	constructor(
		private readonly executionService: XpertAgentExecutionService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecutionDelCommand): Promise<void> {
		await this.executionService.delete(command.conditions)
	}
}
