import { IQuery } from '@nestjs/cqrs'

/**
 * Total xperts
 */
export class StatisticsXpertsQuery implements IQuery {
    static readonly type = '[Xpert] Statistics xperts'

    constructor(
        public readonly start?: string,
        public readonly end?: string,
    ) {}
}
