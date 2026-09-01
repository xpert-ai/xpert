import type { ProjectEnsureResult } from '@xpert-ai/plugin-sdk'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertProjectService } from '../../project.service'
import { EnsureXpertProjectCommand } from '../ensure-project.command'

@CommandHandler(EnsureXpertProjectCommand)
/** CQRS boundary for the plugin runtime Project provisioning capability. */
export class EnsureXpertProjectHandler implements ICommandHandler<EnsureXpertProjectCommand> {
    private readonly logger = new Logger(EnsureXpertProjectHandler.name)

    constructor(private readonly projectService: XpertProjectService) {}

    async execute(command: EnsureXpertProjectCommand): Promise<ProjectEnsureResult> {
        try {
            return await this.projectService.ensureManagedProject(command.input)
        } catch (error) {
            const response = error && typeof error === 'object' ? Reflect.get(error, 'response') : null
            const errorCode = response && typeof response === 'object' ? Reflect.get(response, 'errorCode') : null
            const message = error instanceof Error ? error.message : 'Unknown managed Project ensure failure'
            this.logger.warn(
                `Managed Project ensure failed (${typeof errorCode === 'string' ? errorCode : 'unclassified'}): ${message}`
            )
            throw error
        }
    }
}
