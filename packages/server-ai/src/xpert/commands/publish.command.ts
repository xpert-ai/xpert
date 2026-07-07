import { ICommand } from '@nestjs/cqrs'
import type { TXpertPublishMarketplaceInput } from '@xpert-ai/contracts'

/**
 * Release and if create a new version
 */
export class XpertPublishCommand implements ICommand {
    static readonly type = '[Xpert Role] Publish'

    constructor(
        public readonly id: string,
        public readonly newVersion: boolean,
        public readonly environmentId: string,
        public readonly notes: string,
        public readonly marketplace?: TXpertPublishMarketplaceInput
    ) {}
}
