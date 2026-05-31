import { IQuery } from '@nestjs/cqrs'
import { StatisticsQueryFilters } from './statistics-filters'

/**
 * 
 */
export class StatisticsAverageSessionInteractionsQuery implements IQuery {
    static readonly type = '[ChatConversation] Statistics average session interactions'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
        public readonly filters?: StatisticsQueryFilters
    ) {}
}
