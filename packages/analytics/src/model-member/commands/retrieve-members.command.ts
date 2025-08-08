import { DSCoreService } from '@metad/ocap-core';
import { ICommand } from '@nestjs/cqrs';

/**
 * Retrieve members of a dimension in a cube.
 */
export class RetrieveMembersCommand implements ICommand {
    static readonly type = '[Dimension Member] Retrieve dimension members';

    constructor(
        public readonly query: string,
        public readonly params: {
            modelId: string
            cube: string
            dimension: string
            hierarchy?: string
            level?: string
            topK?: number
            // isDraft?: boolean
            dsCoreService?: DSCoreService
            reEmbedding?: boolean
        }
    ) {}
}
