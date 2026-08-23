import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertService } from '../../xpert/xpert.service'
import { PluginResourceInstallerService } from '../plugin-resource-installer.service'
import { PluginTemplateSyncDependenciesCommand } from './sync-template-dependencies.command'
import { resolveTemplateRuntimeDependencyComponents } from './template-runtime-dependencies'

@CommandHandler(PluginTemplateSyncDependenciesCommand)
export class PluginTemplateSyncDependenciesHandler implements ICommandHandler<PluginTemplateSyncDependenciesCommand> {
    constructor(
        private readonly installer: PluginResourceInstallerService,
        private readonly xpertService: XpertService
    ) {}

    async execute(command: PluginTemplateSyncDependenciesCommand): Promise<void> {
        const components = await resolveTemplateRuntimeDependencyComponents(
            this.installer,
            command.pluginName,
            command.dependencies
        )
        if (!components.length) {
            return
        }

        // Load the imported graph at execution time; component installation
        // mutates the Agent-specific middleware bindings in that current draft.
        const xpert = await this.xpertService.getTeam(command.xpertId)
        await this.installer.installComponentsForXpert(xpert, components)
    }
}
