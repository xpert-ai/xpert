import { IQuery } from '@nestjs/cqrs'
import { StatisticsQueryFilters } from './statistics-filters'

/**
 * 
 */
export class StatisticsDailyMessagesQuery implements IQuery {
    static readonly type = '[Xpert] Statistics daily messages'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
        public readonly currentUserOnly?: boolean,
        public readonly filters?: StatisticsQueryFilters
    ) {}
}
