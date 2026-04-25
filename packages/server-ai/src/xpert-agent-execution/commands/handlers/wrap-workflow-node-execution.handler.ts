import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { WrapWorkflowNodeExecutionCommand } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'

@CommandHandler(WrapWorkflowNodeExecutionCommand)
export class WrapWorkflowNodeExecutionHandler implements ICommandHandler<WrapWorkflowNodeExecutionCommand> {
	constructor(
		private readonly agentMiddlewareRuntimeService: AgentMiddlewareRuntimeService
	) {}

	public async execute(command: WrapWorkflowNodeExecutionCommand): Promise<void> {
		return await this.agentMiddlewareRuntimeService.wrapWorkflowNodeExecution(command.fuc, command.params)
	}
}
