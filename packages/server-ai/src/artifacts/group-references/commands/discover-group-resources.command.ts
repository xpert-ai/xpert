import { Command } from '@nestjs/cqrs'
import type { ContentActor } from '@xpert-ai/plugin-sdk'
import type { ConversationResourceItem } from '@xpert-ai/contracts'

/** Discover accepted references as safe metadata, keeping grant checks and type resolution in Artifacts. */
export class DiscoverGroupResourcesCommand extends Command<{
    items: ConversationResourceItem[]
    nextOffset: number | null
}> {
    constructor(
        readonly actor: ContentActor,
        readonly groupId: string,
        readonly query: { search?: string; typeId?: string; offset: number; limit: number }
    ) {
        super()
    }
}
