import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxStopManagedServiceCommand } from '../stop-managed-service.command'
import { SandboxManagedServiceService } from '../../sandbox-managed-service.service'

@CommandHandler(SandboxStopManagedServiceCommand)
export class SandboxStopManagedServiceHandler implements ICommandHandler<SandboxStopManagedServiceCommand> {
    constructor(private readonly sandboxManagedServiceService: SandboxManagedServiceService) {}

    async execute(command: SandboxStopManagedServiceCommand) {
        return this.sandboxManagedServiceService.stopByThreadId(command.params.threadId, command.params.serviceId)
    }
}
