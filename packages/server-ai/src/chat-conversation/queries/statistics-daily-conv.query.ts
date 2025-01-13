import { IQuery } from '@nestjs/cqrs'

/**
 * Daily conversations
 */
export class StatisticsDailyConvQuery implements IQuery {
    static readonly type = '[Conversation] Statistics daily conversations'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
    ) {}
}
