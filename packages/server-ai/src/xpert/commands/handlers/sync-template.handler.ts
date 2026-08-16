import { LanguagesEnum, TXpertTemplateSyncResult } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { yaml } from '@xpert-ai/server-common'
import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'
import { XpertDraftDslDTO } from '../../dto'
import { createXpertTemplateSource, resolveXpertTemplateSource } from '../../template-source'
import { XpertService } from '../../xpert.service'
import { XpertImportCommand } from '../import.command'
import { XpertSyncTemplateCommand } from '../sync-template.command'

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
        let template
        try {
            template = await this.xpertTemplateService.getTemplateDetail(currentSource.templateId, language)
        } catch {
            throw new BadRequestException(
                `Source template '${currentSource.templateId}' is not available. Refresh or reinstall its plugin first.`
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

        return {
            xpertId: xpert.id,
            templateSource,
            templateTitle: template.title?.trim() || template.name?.trim() || template.id,
            ...(template.releaseNotes ? { releaseNotes: template.releaseNotes } : {})
        }
    }
}
