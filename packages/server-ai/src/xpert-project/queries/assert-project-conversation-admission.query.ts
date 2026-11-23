import { Query } from '@nestjs/cqrs'
import type { EntityManager } from 'typeorm'

/** Validates project move boundaries within the caller's transaction and thread lock. */
export class AssertProjectConversationAdmissionQuery extends Query<void> {
    constructor(
        readonly manager: EntityManager,
        readonly scope: {
            conversationId: string
            threadId: string
            projectId: string
            headMessageId?: string
            executionId?: string
        },
        readonly sourceMessageId?: string,
        readonly target?: { executionId?: string; aiMessageId?: string }
    ) {
        super()
    }
}
