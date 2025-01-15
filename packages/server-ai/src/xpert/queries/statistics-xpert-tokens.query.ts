import { IQuery } from '@nestjs/cqrs'

/**
 * Tokens by xpert
 */
export class StatisticsXpertTokensQuery implements IQuery {
    static readonly type = '[Xpert] Statistics tokens by xpert'

    constructor(
        public readonly start: string,
        public readonly end: string,
    ) {}
}
