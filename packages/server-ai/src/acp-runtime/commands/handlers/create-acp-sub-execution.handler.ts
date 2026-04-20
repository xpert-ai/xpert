import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AcpRuntimeService } from '../../acp-runtime.service'
import { CreateAcpSubExecutionCommand, CreateAcpSubExecutionResult } from '../create-acp-sub-execution.command'

@CommandHandler(CreateAcpSubExecutionCommand)
export class CreateAcpSubExecutionHandler implements ICommandHandler<CreateAcpSubExecutionCommand, CreateAcpSubExecutionResult> {
  constructor(private readonly runtimeService: AcpRuntimeService) {}

  async execute(command: CreateAcpSubExecutionCommand): Promise<CreateAcpSubExecutionResult> {
    return this.runtimeService.createSubExecution(command.input)
  }
}
