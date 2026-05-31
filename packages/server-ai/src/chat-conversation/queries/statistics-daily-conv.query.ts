import { IQuery } from '@nestjs/cqrs'
import { StatisticsQueryFilters } from './statistics-filters'

/**
 * Daily conversations
 */
export class StatisticsDailyConvQuery implements IQuery {
    static readonly type = '[Conversation] Statistics daily conversations'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
        public readonly filters?: StatisticsQueryFilters
    ) {}
}
