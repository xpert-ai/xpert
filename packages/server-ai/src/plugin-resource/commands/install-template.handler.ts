import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { PluginResourceInstallResult, PluginResourceInstallerService } from '../plugin-resource-installer.service'
import { PluginTemplateInstallCommand } from './install-template.command'

@CommandHandler(PluginTemplateInstallCommand)
export class PluginTemplateInstallHandler implements ICommandHandler<PluginTemplateInstallCommand> {
    constructor(private readonly installer: PluginResourceInstallerService) {}

    execute(command: PluginTemplateInstallCommand): Promise<PluginResourceInstallResult> {
        return this.installer.installTemplate(command.templateId, command.workspaceId, command.basic, command.language)
    }
}
