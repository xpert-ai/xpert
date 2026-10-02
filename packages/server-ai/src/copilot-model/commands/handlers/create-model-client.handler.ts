import { forwardRef, Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CreateModelClientCommand } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime/index'

@CommandHandler(CreateModelClientCommand)
export class CreateModelClientHandler implements ICommandHandler<CreateModelClientCommand> {
    constructor(
        @Inject(forwardRef(() => AgentMiddlewareRuntimeService))
        private readonly agentMiddlewareRuntimeService: AgentMiddlewareRuntimeService
    ) {}

    public async execute(command: CreateModelClientCommand) {
        return this.agentMiddlewareRuntimeService.createModelClient(command.copilotModel, command.options)
    }
}
