import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ConversationResourceService } from '../../discovery/conversation-resource.service'
import { DiscoverConversationResourcesCommand } from '../discover-conversation-resources.command'

@CommandHandler(DiscoverConversationResourcesCommand)
export class DiscoverConversationResourcesHandler implements ICommandHandler<DiscoverConversationResourcesCommand> {
    constructor(private readonly resources: ConversationResourceService) {}
    execute({ scope, query }: DiscoverConversationResourcesCommand) {
        return this.resources.list(scope, query)
    }
}
