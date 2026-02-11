import { IXpertAgentExecution } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionUpsertCommand } from '../upsert.command'

@CommandHandler(XpertAgentExecutionUpsertCommand)
export class XpertAgentExecutionUpsertHandler implements ICommandHandler<XpertAgentExecutionUpsertCommand> {
	readonly #logger = new Logger(XpertAgentExecutionUpsertHandler.name)

	constructor(
		private readonly executionService: XpertAgentExecutionService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecutionUpsertCommand): Promise<IXpertAgentExecution> {
		const entity = command.execution
		if (entity.id) {
			return await this.executionService.update(entity.id, entity)
		}
		return await this.executionService.create(entity)
	}
}
