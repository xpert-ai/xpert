import { Command } from '@nestjs/cqrs'

/** Runs that entered governed analysis publish only checked final messages, never raw model deltas. */
export class GroupAnalysisStreamingCommand extends Command<boolean> {
    constructor(
        readonly tenantId: string,
        readonly organizationId: string,
        readonly groupId: string,
        readonly executionId: string
    ) {
        super()
    }
}
