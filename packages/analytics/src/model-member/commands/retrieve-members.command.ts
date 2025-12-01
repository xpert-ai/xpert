import { Document } from '@langchain/core/documents'
import { DSCoreService } from '@metad/ocap-core';
import { Command } from '@nestjs/cqrs';

/**
 * Retrieve members of a dimension in a cube.
 */
export class RetrieveMembersCommand extends Command<Array<[Document, number]>> {
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
    ) {
        super();
    }
}
