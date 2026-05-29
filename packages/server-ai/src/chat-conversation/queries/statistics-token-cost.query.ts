import { IQuery } from '@nestjs/cqrs'
import { StatisticsQueryFilters } from './statistics-filters'

/**
 * Statistics token cost
 */
export class StatisticsTokenCostQuery implements IQuery {
    static readonly type = '[ChatConversation] Statistics token cost'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
        public readonly filters?: StatisticsQueryFilters
    ) {}
}
