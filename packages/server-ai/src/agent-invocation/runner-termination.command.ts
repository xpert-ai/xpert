import { Command } from '@nestjs/cqrs'
import type {
    AgentInvocationScope,
    AgentRunnerExitEvidence,
    AgentRunnerReceipt,
    AgentRunnerTerminationReason
} from '@xpert-ai/plugin-sdk'

/** Host supervisor bookkeeping for an already admitted runner; grants no business/resource access. */
export class RecordRunnerTerminationCommand extends Command<boolean> {
    constructor(
        public readonly scope: AgentInvocationScope,
        public readonly receipt: AgentRunnerReceipt,
        public readonly action:
            | { type: 'request'; reason: AgentRunnerTerminationReason }
            | { type: 'confirm'; completion: AgentRunnerExitEvidence }
    ) {
        super()
    }
}
