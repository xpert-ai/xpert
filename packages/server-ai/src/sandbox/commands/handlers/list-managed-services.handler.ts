import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxListManagedServicesCommand } from '../list-managed-services.command'
import { SandboxManagedServiceService } from '../../sandbox-managed-service.service'

@CommandHandler(SandboxListManagedServicesCommand)
export class SandboxListManagedServicesHandler implements ICommandHandler<SandboxListManagedServicesCommand> {
    constructor(private readonly sandboxManagedServiceService: SandboxManagedServiceService) {}

    async execute(command: SandboxListManagedServicesCommand) {
        return this.sandboxManagedServiceService.listByThreadId(command.params.threadId)
    }
}
