import { Command } from '@nestjs/cqrs'

/** Publish an allowlisted runtime display snapshot. Host-only; never an HTTP/model input API. */
export class ProjectGroupDisplayCommand extends Command<void> {
    constructor(
        public readonly tenantId: string,
        public readonly organizationId: string,
        public readonly receiptId: string,
        public readonly outputId: string,
        /** Untrusted tool content is validated again by the owning group handler. */
        public readonly content: unknown
    ) {
        super()
    }
}
