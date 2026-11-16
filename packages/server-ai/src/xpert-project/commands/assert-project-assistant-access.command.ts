import { ForbiddenException } from '@nestjs/common'
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { t } from 'i18next'
import { XpertProjectAccessService } from '../services/project-access.service'
import { toProjectViewAccess } from '../services/project-view-access'

/** Revalidate the actor's access to the bound Assistant for the requested project operation. */
export class AssertProjectAssistantAccessCommand extends Command<void> {
    constructor(
        readonly projectId: string,
        readonly assistantId: string,
        readonly operation: 'use' | 'manage' = 'use'
    ) {
        super()
    }
}

@CommandHandler(AssertProjectAssistantAccessCommand)
export class AssertProjectAssistantAccessHandler implements ICommandHandler<AssertProjectAssistantAccessCommand> {
    constructor(private readonly access: XpertProjectAccessService) {}

    async execute(command: AssertProjectAssistantAccessCommand): Promise<void> {
        const access = await this.access.assertCanUseXpert(command.projectId, command.assistantId)
        if (command.operation === 'manage' && !toProjectViewAccess(access.role, access.project.status).canManage) {
            throw new ForbiddenException(t('server-ai:Error.ProjectManagerRequired'))
        }
    }
}
