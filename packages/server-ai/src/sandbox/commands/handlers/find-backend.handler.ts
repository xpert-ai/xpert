import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SandboxFindBackendCommand } from '../find-backend.command'
import { SandboxAcquireBackendHandler } from './acquire-backend.handler'

@CommandHandler(SandboxFindBackendCommand)
export class SandboxFindBackendHandler implements ICommandHandler<SandboxFindBackendCommand> {
    constructor(private readonly backends: SandboxAcquireBackendHandler) {}

    async execute(command: SandboxFindBackendCommand) {
        return this.backends.find(command.params)
    }
}
