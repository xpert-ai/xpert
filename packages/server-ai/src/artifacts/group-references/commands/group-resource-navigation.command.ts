import { Command } from '@nestjs/cqrs'
import type { ContentActor } from '@xpert-ai/plugin-sdk'
import type { ChatGroupResourceLink } from '@xpert-ai/contracts'

/** Metadata-only navigation through accepted group references; never reads source bytes or query data. */
export class GroupResourceNavigationCommand extends Command<{ items: ChatGroupResourceLink[]; hasMore: boolean }> {
    constructor(
        readonly actor: ContentActor,
        readonly groupId: string,
        readonly input: { query: string; offset: number } | { referenceIds: string[] }
    ) {
        super()
    }
}
