import { IQuery } from '@nestjs/cqrs'

/**
 * Total integrations for xperts
 */
export class StatisticsXpertIntegrationsQuery implements IQuery {
    static readonly type = '[Xpert] Statistics xperts'

    constructor(
        public readonly start?: string,
        public readonly end?: string,
    ) {}
}
