import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertProjectAccessService } from '../services/project-access.service'

/** Revalidate current Project membership and its Assistant binding before task execution. */
export class AssertProjectAssistantAccessCommand extends Command<void> {
    constructor(
        readonly projectId: string,
        readonly assistantId: string
    ) {
        super()
    }
}

@CommandHandler(AssertProjectAssistantAccessCommand)
export class AssertProjectAssistantAccessHandler implements ICommandHandler<AssertProjectAssistantAccessCommand> {
    constructor(private readonly access: XpertProjectAccessService) {}

    async execute(command: AssertProjectAssistantAccessCommand): Promise<void> {
        await this.access.assertCanUseXpert(command.projectId, command.assistantId)
    }
}
