import { IQuery } from '@nestjs/cqrs'
import { StatisticsQueryFilters } from './statistics-filters'

/**
 * 
 */
export class StatisticsDailyEndUsersQuery implements IQuery {
    static readonly type = '[Xpert] Statistics daily end users'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
        public readonly filters?: StatisticsQueryFilters
    ) {}
}
