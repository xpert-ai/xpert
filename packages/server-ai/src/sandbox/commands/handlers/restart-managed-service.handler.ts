import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxRestartManagedServiceCommand } from '../restart-managed-service.command'
import { SandboxManagedServiceService } from '../../sandbox-managed-service.service'

@CommandHandler(SandboxRestartManagedServiceCommand)
export class SandboxRestartManagedServiceHandler implements ICommandHandler<SandboxRestartManagedServiceCommand> {
    constructor(private readonly sandboxManagedServiceService: SandboxManagedServiceService) {}

    async execute(command: SandboxRestartManagedServiceCommand) {
        return this.sandboxManagedServiceService.restartByThreadId(command.params.threadId, command.params.serviceId)
    }
}
