import { IQuery } from '@nestjs/cqrs'

/**
 * 
 */
export class StatisticsDailyMessagesQuery implements IQuery {
    static readonly type = '[Xpert] Statistics daily messages'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
    ) {}
}
