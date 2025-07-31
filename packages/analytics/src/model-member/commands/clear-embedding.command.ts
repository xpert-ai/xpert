import { ICommand } from '@nestjs/cqrs';

/**
 * Clear embedding members by (model dimension or model cube)
 */
export class ClearEmbeddingMembersCommand implements ICommand {
    static readonly type = '[Dimension Member] Clear embedding members';

    constructor(
        public readonly modelKey: string,
        public readonly cube: string,
        public readonly params: {
            dimension?: string
            isDraft?: boolean
        }
    ) {}
}
