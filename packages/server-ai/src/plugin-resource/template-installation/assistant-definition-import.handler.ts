import { AssistantTemplateToolsetBinder } from '../commands/assistant-template-toolset-binder.service'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
    PrepareAssistantDefinitionCommand,
    InstallAssistantDefinitionDependenciesCommand
} from './template-readiness.command'
import { TemplateReadinessService } from './template-readiness.service'
import { TemplateDependencyInstaller } from './template-dependency-installer.service'

@CommandHandler(PrepareAssistantDefinitionCommand)
export class PrepareAssistantDefinitionHandler implements ICommandHandler<PrepareAssistantDefinitionCommand> {
    constructor(private readonly readiness: TemplateReadinessService) {}
    async execute(command: PrepareAssistantDefinitionCommand) {
        const prepared = await this.readiness.prepare(command.template, command.workspaceId)
        return { definition: prepared.normalized.definition, locks: prepared.readiness.dependencies }
    }
}
@CommandHandler(InstallAssistantDefinitionDependenciesCommand)
export class InstallAssistantDefinitionDependenciesHandler implements ICommandHandler<InstallAssistantDefinitionDependenciesCommand> {
    constructor(
        private readonly readiness: TemplateReadinessService,
        private readonly installer: TemplateDependencyInstaller,
        private readonly toolsets: AssistantTemplateToolsetBinder
    ) {}
    async execute(command: InstallAssistantDefinitionDependenciesCommand) {
        const prepared = await this.readiness.prepare(command.template, command.assistant.workspaceId, command.locks)
        await this.installer.install(command.assistant, prepared.components, command.locks)
        await this.toolsets.bind(command.assistant, undefined, prepared.normalized.dependencies)
    }
}
