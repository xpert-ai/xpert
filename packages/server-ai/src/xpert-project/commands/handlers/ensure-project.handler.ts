import type { ProjectEnsureResult } from '@xpert-ai/plugin-sdk'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertProjectService } from '../../project.service'
import { EnsureXpertProjectCommand } from '../ensure-project.command'

@CommandHandler(EnsureXpertProjectCommand)
/** CQRS boundary for the plugin runtime Project provisioning capability. */
export class EnsureXpertProjectHandler implements ICommandHandler<EnsureXpertProjectCommand> {
    constructor(private readonly projectService: XpertProjectService) {}

    execute(command: EnsureXpertProjectCommand): Promise<ProjectEnsureResult> {
        return this.projectService.ensureManagedProject(command.input)
    }
}
