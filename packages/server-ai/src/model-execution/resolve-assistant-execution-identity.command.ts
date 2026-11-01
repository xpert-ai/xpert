import { Command } from '@nestjs/cqrs'
import type { IApiPrincipal } from '@xpert-ai/contracts'
import type { Xpert } from '../xpert/xpert.entity'

/** Restore an Assistant actor for a trusted execution; never grants access to its Computer or models. */
export class ResolveAssistantExecutionIdentityCommand extends Command<{
    user: IApiPrincipal
    assistant: Xpert
} | null> {
    constructor(
        public readonly actor: { tenantId: string; organizationId: string; userId: string },
        public readonly conversationId?: string,
        public readonly xpertId?: string
    ) {
        super()
    }
}
