import { IQuery } from '@nestjs/cqrs'

/**
 * Conversation messages by xpert
 */
export class StatisticsXpertMessagesQuery implements IQuery {
    static readonly type = '[Xpert] Statistics conversation messages by xpert'

    constructor(
        public readonly start: string,
        public readonly end: string,
    ) {}
}
