import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GetRuntimeCapabilitiesCommand } from './get-runtime-capabilities.command'
import { RuntimeCapabilitiesService } from './runtime-capabilities.service'

@CommandHandler(GetRuntimeCapabilitiesCommand)
export class GetRuntimeCapabilitiesHandler implements ICommandHandler<GetRuntimeCapabilitiesCommand> {
    constructor(private readonly capabilities: RuntimeCapabilitiesService) {}

    execute({ xpert, assistantId, projectId }: GetRuntimeCapabilitiesCommand) {
        return this.capabilities.getRuntimeCapabilities(xpert, assistantId, projectId)
    }
}
