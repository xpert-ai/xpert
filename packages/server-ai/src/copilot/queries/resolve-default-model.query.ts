import { DefaultModelRole } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Resolve a default purpose to its scoped connection and model binding.
 * The tenantId parameter is required as the program might be running in the background.
 */
export class ResolveDefaultModelQuery implements IQuery {
    static readonly type = '[Copilot] Resolve default model'

    constructor(
        public readonly tenantId: string,
        public readonly organizationId: string,
        public readonly role: DefaultModelRole,
        public readonly relations?: string[]
    ) {}
}
