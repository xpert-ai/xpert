import { IQuery } from '@nestjs/cqrs'
import { StatisticsQueryFilters } from './statistics-filters'

/**
 * Statistics tokens per second
 */
export class StatisticsTokensPerSecondQuery implements IQuery {
    static readonly type = '[ChatConversation] Statistics tokens per second'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
        public readonly filters?: StatisticsQueryFilters
    ) {}
}
