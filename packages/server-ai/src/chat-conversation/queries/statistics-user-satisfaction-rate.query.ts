import { IQuery } from '@nestjs/cqrs'

/**
 * Statistics user satisfaction rate
 */
export class StatisticsUserSatisfactionRateQuery implements IQuery {
    static readonly type = '[ChatConversation] Statistics user satisfaction rate'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
    ) {}
}
