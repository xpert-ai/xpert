import { Command } from '@nestjs/cqrs'
import type { IChatConversation, TMessageContentResourceCard } from '@xpert-ai/contracts'

export type BoundConversationResourceCard = TMessageContentResourceCard & {
    messageId: string
    executionId: string
}

/** Refresh persisted cards for live conversation snapshots. Registered resource providers enforce business access; the host retains message bindings. */
export class RefreshConversationResourceCardsCommand extends Command<TMessageContentResourceCard[]> {
    constructor(
        public readonly conversation: Pick<IChatConversation, 'id' | 'tenantId' | 'organizationId' | 'projectId'>,
        public readonly threadId: string,
        /** Caller supplies cards and bindings read from authorized conversation messages. */
        public readonly cards: readonly BoundConversationResourceCard[]
    ) {
        super()
    }
}
