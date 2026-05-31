import { IQuery } from '@nestjs/cqrs'
import { StatisticsQueryFilters } from './statistics-filters'

/**
 * Used models in conversation statistics
 */
export class StatisticsModelsQuery implements IQuery {
    static readonly type = '[ChatConversation] Statistics models'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly filters?: StatisticsQueryFilters
    ) {}
}
