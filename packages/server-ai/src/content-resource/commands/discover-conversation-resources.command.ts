import { Command } from '@nestjs/cqrs'
import type { ConversationResourceScope } from '@xpert-ai/plugin-sdk'
import type { ConversationResourcePage, ConversationResourceQuery } from '@xpert-ai/contracts'

/** Host-internal discovery entry for admitted Assistant tools. External plugins use ContentResourcesApi.discovery. */
export class DiscoverConversationResourcesCommand extends Command<ConversationResourcePage> {
    constructor(
        readonly scope: ConversationResourceScope,
        readonly query: ConversationResourceQuery
    ) {
        super()
    }
}
