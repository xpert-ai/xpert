import { Command } from '@nestjs/cqrs'
import type { ResolvedExecutionIdentity } from '@xpert-ai/server-core'

/** Restore a persisted Assistant principal; human actors return null. Resource access remains separate. */
export class ResolveAssistantPrincipalCommand extends Command<ResolvedExecutionIdentity | null> {
    constructor(
        readonly input: {
            tenantId: string
            organizationId?: string | null
            userId?: string
            assistantId?: string
            projectId?: string
        }
    ) {
        super()
    }
}
