import { Command, CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { BadRequestException } from '@nestjs/common'
import type {
    IXpert,
    RuntimeResourcesSelection,
    TemplateAgentSource,
    TemplateDependencyLock,
    TXpertTemplate
} from '@xpert-ai/contracts'
import { stringify } from 'yaml'
import { t } from 'i18next'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { RuntimeResourceService } from '../runtime-resource.service'
import { loadRuntimeTemplate } from './runtime-template'
import { PrepareTemplateExecutionCommand } from '../../plugin-resource/template-installation/prepare-template-execution.command'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../../xpert/queries/get-xpert-workflow.query'
import { ResolveAssistantFileAccessCommand } from '../../xpert/assistant-files/resolve-assistant-file-access.command'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'

export class ResolveTemplateExecutionCommand extends Command<{
    owner: IXpert
    prepared: import('../../plugin-resource/template-installation/prepare-template-execution.command').PreparedTemplateExecution
}> {
    constructor(
        readonly assistantId: string,
        readonly selection: RuntimeResourcesSelection,
        readonly source: TemplateAgentSource,
        readonly projectId?: string,
        readonly locks?: TemplateDependencyLock[]
    ) {
        super()
    }
}

/** Recheck selection and package access without resolving dependencies or creating task state. */
export class AuthorizeTemplateExecutionCommand extends Command<IXpert> {
    constructor(
        readonly assistantId: string,
        readonly selection: RuntimeResourcesSelection,
        readonly source: TemplateAgentSource,
        readonly projectId?: string
    ) {
        super()
    }
}

@CommandHandler(AuthorizeTemplateExecutionCommand)
export class AuthorizeTemplateExecutionHandler implements ICommandHandler<AuthorizeTemplateExecutionCommand> {
    constructor(
        private readonly resources: RuntimeResourceService,
        private readonly queries: QueryBus,
        private readonly commands: CommandBus
    ) {}

    async execute(command: AuthorizeTemplateExecutionCommand) {
        const { source } = command
        // A USER_XPERT audience can outlive its user's grant. Recheck the actual task
        // workspace even on cached replay; Project grants do not unlock Assistant files.
        await this.commands.execute(
            command.projectId
                ? new AssertProjectAssistantAccessCommand(command.projectId, command.assistantId)
                : new ResolveAssistantFileAccessCommand(command.assistantId, 'capabilities', 'runtime')
        )
        const resources = await this.resources.resolve(command.assistantId, command.selection, command.projectId)
        if (
            !resources.templates?.some(
                (item) =>
                    item.bindingId === source.bindingId &&
                    item.version === source.version &&
                    item.digest === source.digest &&
                    item.templateKey === source.templateKey &&
                    item.packageName === source.packageName
            )
        )
            throw new BadRequestException(t('server-ai:Error.AgentResourceUnavailable'))
        const { agent } = await this.queries.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
            new GetXpertWorkflowQuery(command.assistantId)
        )
        return agent.team
    }
}

@CommandHandler(ResolveTemplateExecutionCommand)
export class ResolveTemplateExecutionHandler implements ICommandHandler<ResolveTemplateExecutionCommand> {
    constructor(
        private readonly packages: AgentPluginInstallationsService,
        private readonly commands: CommandBus
    ) {}

    async execute(command: ResolveTemplateExecutionCommand) {
        const { source } = command
        const owner = await this.commands.execute(
            new AuthorizeTemplateExecutionCommand(command.assistantId, command.selection, source, command.projectId)
        )
        const resolved = await this.packages.reference(source, owner.workspaceId)
        if (!resolved || resolved.pkg.digest !== source.digest)
            throw new BadRequestException(t('server-ai:Error.TemplateDependencyChanged'))
        const normalized = await loadRuntimeTemplate(resolved.pkg, source.templateKey)
        // A dependency without an authored digest follows the version selected on first dispatch,
        // even when a newer package has since become the workspace default.
        for (const dependency of [
            ...(normalized.dependencies.skills ?? []),
            ...(normalized.dependencies.mcpServers ?? [])
        ]) {
            if (dependency.source && !dependency.source.digest) {
                const pinned = command.locks?.find((lock) => lock.source?.name === dependency.source.name)
                if (pinned?.source) dependency.source.digest = pinned.source.digest
            }
        }
        const template: TXpertTemplate = {
            id: source.templateKey,
            name: normalized.definition.team.name,
            export_data: stringify(normalized.definition),
            title: normalized.definition.team.title || normalized.definition.team.name,
            description: normalized.definition.team.description || '',
            category: 'assistant',
            copyright: '',
            avatar: normalized.definition.team.avatar ?? null,
            type: normalized.definition.team.type ?? XpertTypeEnum.Agent,
            manifest: normalized.manifest,
            dependencies: normalized.dependencies
        }
        const prepared = await this.commands.execute(
            new PrepareTemplateExecutionCommand(template, owner, command.locks, command.projectId)
        )
        return { owner, prepared }
    }
}
