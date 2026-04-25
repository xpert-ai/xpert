import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CreateModelClientCommand } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'


@CommandHandler(CreateModelClientCommand)
export class CreateModelClientHandler implements ICommandHandler<CreateModelClientCommand> {
	constructor(
    private readonly agentMiddlewareRuntimeService: AgentMiddlewareRuntimeService
  ) {}

  public async execute(command: CreateModelClientCommand) {
    return this.agentMiddlewareRuntimeService.createModelClient(command.copilotModel, command.options)
  }
}
