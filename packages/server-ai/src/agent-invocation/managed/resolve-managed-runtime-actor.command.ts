import { Command } from '@nestjs/cqrs'
import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'

/** Revalidate the current conversation and published Assistant before using a deployment-owned transport. */
export class ResolveManagedRuntimeActorCommand extends Command<{ modelSourceId: string }> {
    constructor(readonly scope: Readonly<AgentInvocationScope>) {
        super()
    }
}
