import { IQuery } from '@nestjs/cqrs'

/**
 * 
 */
export class StatisticsDailyConvQuery implements IQuery {
    static readonly type = '[Conversation] Statistics daily conversations'

    constructor(
        public readonly id: string,
        public readonly start: string,
        public readonly end: string,
    ) {}
}
