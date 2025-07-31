import { DSCoreService } from '@metad/ocap-core';
import { ICommand } from '@nestjs/cqrs';

/**
 * Embedding a specific member collection (model dimension or model cube)
 */
export class EmbeddingMembersCommand implements ICommand {
    static readonly type = '[Dimension Member] Embedding members';

    constructor(
        public readonly dsCoreService: DSCoreService,
        public readonly modelKey: string,
        public readonly cube: string,
        public readonly params: {
            dimension?: string
            isDraft?: boolean
        }
    ) {}
}
