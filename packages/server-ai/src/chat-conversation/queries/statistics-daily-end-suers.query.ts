import { IQuery } from '@nestjs/cqrs'

/**
 * 
 */
export class StatisticsDailyEndUsersQuery implements IQuery {
    static readonly type = '[Xpert] Statistics daily end users'

    constructor(
        public readonly start: string,
        public readonly end: string,
        public readonly xpertId?: string,
    ) {}
}
