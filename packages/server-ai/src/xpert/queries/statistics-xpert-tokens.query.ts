import { IQuery } from '@nestjs/cqrs'
import { StatisticsQueryFilters } from '../../chat-conversation/queries'

/**
 * Tokens by xpert
 */
export class StatisticsXpertTokensQuery implements IQuery {
    static readonly type = '[Xpert] Statistics tokens by xpert'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly filters?: StatisticsQueryFilters
    ) {}
}
