import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CONTENT_CATALOG_PROVIDER } from '@xpert-ai/contracts'
import { ContentCatalogService } from '../../catalog/content-catalog.service'
import { ContentEditorsService } from '../../content-editors.service'
import { ResolveConversationResourceScopeCommand } from '../../../chat-group/commands/conversation-resource-scope.command'
import { ResolveProjectResourceNavigationCommand } from '../resolve-project-resource-navigation.command'

@CommandHandler(ResolveProjectResourceNavigationCommand)
export class ResolveProjectResourceNavigationHandler implements ICommandHandler<ResolveProjectResourceNavigationCommand> {
    constructor(
        private readonly commands: CommandBus,
        private readonly catalog: ContentCatalogService,
        private readonly editors: ContentEditorsService
    ) {}
    async execute({ scope, contentId }: ResolveProjectResourceNavigationCommand) {
        await this.commands.execute(new ResolveConversationResourceScopeCommand(scope))
        const item = await this.catalog.get({ ...scope, contentId })
        const navigation = await this.editors.resolve({
            ...scope,
            source: { providerKey: CONTENT_CATALOG_PROVIDER, resourceId: contentId }
        })
        const type = (await this.catalog.types(scope)).find(
            (type) =>
                type.providerKey === item.resourceRef.providerKey &&
                type.typeId === item.typeId &&
                type.modelId === item.modelId &&
                type.schemaVersion === item.schemaVersion
        )
        return { title: item.title, ...(type?.icon ? { icon: type.icon } : {}), navigation }
    }
}
