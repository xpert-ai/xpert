import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { WrapWorkflowNodeExecutionCommand } from '@xpert-ai/plugin-sdk'
import { wrapAgentExecution } from '../../../shared/agent/execution'

@CommandHandler(WrapWorkflowNodeExecutionCommand)
export class WrapWorkflowNodeExecutionHandler implements ICommandHandler<WrapWorkflowNodeExecutionCommand> {
	readonly #logger = new Logger(WrapWorkflowNodeExecutionHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: WrapWorkflowNodeExecutionCommand): Promise<void> {
		return await wrapAgentExecution(command.fuc, {
			...command.params,
			commandBus: this.commandBus,
			queryBus: this.queryBus
		})()
	}
}
