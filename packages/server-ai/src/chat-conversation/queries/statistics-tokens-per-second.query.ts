import { IQuery } from '@nestjs/cqrs'

/**
 * Statistics tokens per second
 */
export class StatisticsTokensPerSecondQuery implements IQuery {
    static readonly type = '[ChatConversation] Statistics tokens per second'

    constructor(
        public readonly id: string,
        public readonly start: string,
        public readonly end: string,
    ) {}
}
