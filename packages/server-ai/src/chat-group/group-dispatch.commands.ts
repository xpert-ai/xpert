import { Command } from '@nestjs/cqrs'
import type { AgentChatDispatchPayload, HandoffMessage } from '@xpert-ai/plugin-sdk'
import type { RequestContextSnapshot } from '../shared/request-context'

/** Bind a durable group receipt to one runtime input before the common chat processor executes it. */
export class PrepareGroupChatCommand extends Command<AgentChatDispatchPayload | null> {
    constructor(public readonly message: HandoffMessage<AgentChatDispatchPayload>) {
        super()
    }
}
/** Reconcile a receipt with runtime state after dispatch, or during recovery when no outcome is known. */
export class FinishGroupChatCommand extends Command<void> {
    constructor(
        public readonly recipientId: string,
        /** True only when the common processor reports an execution failure. */
        public readonly dispatchFailed = false,
        /** True for a terminal processor callback; recovery scans leave this false. */
        public readonly dispatchFinished = false
    ) {
        super()
    }
}

/**
 * Reauthorize a prepared group delivery and resolve its real human execution context.
 * Called inside withGroupRuntime; the returned context stays in-process, never in queue payloads.
 */
export class ResolveGroupDeliveryContextCommand extends Command<RequestContextSnapshot> {
    constructor(
        public readonly recipientId: string,
        public readonly tenantId: string,
        public readonly conversationId: string
    ) {
        super()
    }
}
