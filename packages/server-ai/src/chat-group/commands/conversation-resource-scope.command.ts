import { Command } from '@nestjs/cqrs'
import type { ConversationResourceScope } from '@xpert-ai/plugin-sdk'

/** Resolve the live group audience of a host-authorized conversation; Project discovery retains its own ACL. */
export class ResolveConversationResourceScopeCommand extends Command<{ groupId: string | null }> {
    constructor(readonly scope: ConversationResourceScope) {
        super()
    }
}
