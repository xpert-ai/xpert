import { IQuery } from '@nestjs/cqrs'

/**
 * Statistics tokens per second
 */
export class StatisticsTokensPerSecondQuery implements IQuery {
    static readonly type = '[ChatConversation] Statistics tokens per second'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
    ) {}
}
