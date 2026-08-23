import { LanguagesEnum, TXpertTemplateSyncResult } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { yaml } from '@xpert-ai/server-common'
import { normalizePluginName } from '@xpert-ai/server-core'
import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'
import { XpertDraftDslDTO } from '../../dto'
import { createXpertTemplateSource, resolveXpertTemplateSource } from '../../template-source'
import { XpertService } from '../../xpert.service'
import { XpertImportCommand } from '../import.command'
import { XpertSyncTemplateCommand } from '../sync-template.command'
import { PluginTemplateSyncDependenciesCommand } from '../../../plugin-resource/commands/sync-template-dependencies.command'

@CommandHandler(XpertSyncTemplateCommand)
export class XpertSyncTemplateHandler implements ICommandHandler<XpertSyncTemplateCommand> {
    constructor(
        private readonly xpertService: XpertService,
        private readonly xpertTemplateService: XpertTemplateService,
        private readonly commandBus: CommandBus
    ) {}

    async execute(command: XpertSyncTemplateCommand): Promise<TXpertTemplateSyncResult> {
        const xpert = await this.xpertService.findOne(command.xpertId)
        const currentSource = resolveXpertTemplateSource(xpert)
        if (!currentSource) {
            throw new BadRequestException('This Xpert is not linked to a source template.')
        }

        const language =
            command.language ?? (RequestContext.getLanguageCode() as LanguagesEnum | undefined) ?? LanguagesEnum.English
        const templateId = resolveTemplateLookupId(currentSource)
        let template
        try {
            template = await this.xpertTemplateService.getTemplateDetail(templateId, language)
        } catch {
            throw new BadRequestException(
                `Source template '${templateId}' is not available. Refresh or reinstall its plugin first.`
            )
        }

        if (typeof template.export_data !== 'string' || !template.export_data.trim()) {
            throw new BadRequestException(`Source template '${currentSource.templateId}' has no DSL content.`)
        }
        const parsed = yaml.parse(template.export_data) as XpertDraftDslDTO
        if (!parsed?.team) {
            throw new BadRequestException(`Source template '${currentSource.templateId}' has no Xpert team definition.`)
        }

        // The template owns the draft graph, while the existing instance keeps its stable name.
        parsed.team.name = xpert.name
        const templateSource = createXpertTemplateSource(template, currentSource)
        await this.commandBus.execute(
            new XpertImportCommand(parsed, {
                targetXpertId: xpert.id,
                normalizeCopilotModels: true,
                language,
                templateId: currentSource.templateId,
                sourceTemplateId: template.id,
                templateSource
            })
        )
        // Reconcile runtime resources after graph import so targetAgentKey
        // selectors bind against the refreshed Agent nodes, not the old draft.
        if (hasRuntimeDependencies(template.dependencies)) {
            await this.commandBus.execute(
                new PluginTemplateSyncDependenciesCommand(xpert.id, template.pluginName, template.dependencies)
            )
        }

        return {
            xpertId: xpert.id,
            templateSource,
            templateTitle: template.title?.trim() || template.name?.trim() || template.id,
            ...(template.releaseNotes ? { releaseNotes: template.releaseNotes } : {})
        }
    }
}

/** Detects declarative runtime dependencies without coupling to one schema version. */
function hasRuntimeDependencies(dependencies: unknown): boolean {
    if (!dependencies || typeof dependencies !== 'object') {
        return false
    }
    return ['skills', 'mcpServers', 'hooks', 'apps', 'plugins'].some((key) => {
        const value = Reflect.get(dependencies, key)
        return Array.isArray(value) && value.length > 0
    })
}

function resolveTemplateLookupId(source: { templateId: string; templateKey?: string; pluginName?: string }) {
    if (source.templateId.includes(':')) {
        return source.templateId
    }

    const pluginName = normalizePluginName(source.pluginName ?? '')
    return pluginName ? `${pluginName}:${source.templateKey || source.templateId}` : source.templateId
}
