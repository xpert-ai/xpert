import { Command } from '@nestjs/cqrs'
import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'

/** Bounded wait and asynchronous continuation share one durable result claim. */
export class ClaimAgentRuntimeResultsCommand extends Command<void> {
    constructor(
        public readonly scope: AgentInvocationScope,
        public readonly callId: string,
        public readonly invocationIds: string[]
    ) {
        super()
    }
}

/** Reconcile a Project projection without changing Invocation facts or deciding a business retry. */
export class ProjectRuntimeObservationCommand extends Command<void> {
    constructor(public readonly invocationId: string) {
        super()
    }
}
