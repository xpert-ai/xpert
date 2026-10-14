import { Command } from '@nestjs/cqrs'

/**
 * Authorize a trusted human against an active group Assistant runtime (or the group's primary runtime).
 * Callers retain their sandbox, file, execution and other resource-specific checks.
 */
export class ResolveGroupRuntimeAccessCommand extends Command<{ groupId: string; assistantId: string }> {
    constructor(
        public readonly actor: { tenantId: string; organizationId: string; userId: string },
        public readonly target: { type: 'runtime'; conversationId: string } | { type: 'group'; groupId: string }
    ) {
        super()
    }
}
