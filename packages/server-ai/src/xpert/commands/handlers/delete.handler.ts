import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { DeleteResult, In, IsNull, Not } from 'typeorm'
import { XpertService } from '../../xpert.service'
import { Xpert } from '../../xpert.entity'
import { XpertDeleteCommand } from '../delete.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'
import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'

@CommandHandler(XpertDeleteCommand)
export class XpertDeleteHandler implements ICommandHandler<XpertDeleteCommand> {
    constructor(
        private readonly service: XpertService,
        private readonly commandBus: CommandBus,
        private readonly xpertTemplateService: XpertTemplateService
    ) {}

    public async execute(command: XpertDeleteCommand): Promise<DeleteResult> {
        const id = command.id

        const xpert = await this.service.findOne(id)
        const others = xpert.latest
            ? await this.service.findAll({ where: { type: xpert.type, slug: xpert.slug, id: Not(xpert.id) } })
            : { items: [] }
        // Deleting the latest definition also removes its versions. Check all targets before any cleanup side effect.
        if (
            await this.service.repository.manager.getRepository(ChatConversation).existsBy({
                tenantId: xpert.tenantId,
                organizationId: xpert.organizationId ?? IsNull(),
                purpose: 'group',
                xpertId: In([xpert, ...others.items].map((version) => version.id))
            })
        )
            throw new ForbiddenException(t('server-ai:Error.GroupPrimaryAssistantInUse'))
        await this.cleanupPublishedTriggers(xpert)
        if (xpert.latest) {
            await this.cleanupExportedTemplates([xpert, ...others.items])
            await this.service.repository.remove(others.items)
        } else {
            await this.cleanupExportedTemplates([xpert])
        }

        return await this.service.delete(id)
    }

    private async cleanupPublishedTriggers(xpert: Xpert): Promise<void> {
        if (!xpert.publishAt || !xpert.graph?.nodes?.length) {
            return
        }

        await this.commandBus.execute(
            new XpertPublishTriggersCommand(
                {
                    ...xpert,
                    graph: {
                        nodes: [],
                        connections: []
                    }
                },
                {
                    strict: false,
                    previousGraph: xpert.graph
                }
            )
        )
    }

    private async cleanupExportedTemplates(xperts: Xpert[]): Promise<void> {
        for (const xpert of xperts) {
            await this.xpertTemplateService.deleteExportedXpertTemplate(xpert.exportedTemplate)
        }
    }
}
