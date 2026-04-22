import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxGetManagedServiceLogsCommand } from '../get-managed-service-logs.command'
import { SandboxManagedServiceService } from '../../sandbox-managed-service.service'

@CommandHandler(SandboxGetManagedServiceLogsCommand)
export class SandboxGetManagedServiceLogsHandler implements ICommandHandler<SandboxGetManagedServiceLogsCommand> {
    constructor(private readonly sandboxManagedServiceService: SandboxManagedServiceService) {}

    async execute(command: SandboxGetManagedServiceLogsCommand) {
        return this.sandboxManagedServiceService.getLogsByThreadId(
            command.params.threadId,
            command.params.serviceId,
            command.params.tail
        )
    }
}
