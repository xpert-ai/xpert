import { IQuery } from '@nestjs/cqrs'

/**
 * Statistics token cost
 */
export class StatisticsTokenCostQuery implements IQuery {
    static readonly type = '[ChatConversation] Statistics token cost'

    constructor(
        public readonly id: string,
        public readonly start: string,
        public readonly end: string,
    ) {}
}
