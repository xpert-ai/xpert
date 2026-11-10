import { IQuery } from '@nestjs/cqrs'

/**
 * User-visible token totals and posted point debits for the requested scope.
 */
export class CopilotUserUsageQuery implements IQuery {
    static readonly type = '[CopilotUser] Usage'

    constructor(
        public readonly params: {
            userId?: string
            xpertId?: string
            start?: string
            end?: string
            threadId?: string
        }
    ) {}
}
