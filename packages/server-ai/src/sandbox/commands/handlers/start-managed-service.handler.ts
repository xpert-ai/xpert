import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxStartManagedServiceCommand } from '../start-managed-service.command'
import { SandboxManagedServiceService } from '../../sandbox-managed-service.service'

@CommandHandler(SandboxStartManagedServiceCommand)
export class SandboxStartManagedServiceHandler implements ICommandHandler<SandboxStartManagedServiceCommand> {
    constructor(private readonly sandboxManagedServiceService: SandboxManagedServiceService) {}

    async execute(command: SandboxStartManagedServiceCommand) {
        return this.sandboxManagedServiceService.startByThreadId(command.params.threadId, command.params.input, {
            agentKey: command.params.agentKey,
            executionId: command.params.executionId
        })
    }
}
