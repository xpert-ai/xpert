import { IQuery } from '@nestjs/cqrs'

/**
 * Conversations by xpert
 */
export class StatisticsXpertConversationsQuery implements IQuery {
    static readonly type = '[Xpert] Statistics conversations by xpert'

    constructor(
        public readonly start: string,
        public readonly end: string,
    ) {}
}
