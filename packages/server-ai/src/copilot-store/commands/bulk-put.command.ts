import { Embeddings } from '@langchain/core/embeddings'
import { LongTermMemoryTypeEnum, TMemoryQA, TMemoryUserProfile } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 */
export class CopilotStoreBulkPutCommand implements ICommand {
    static readonly type = '[Copilot Store] Bulk Put'

    constructor(
        public readonly type: LongTermMemoryTypeEnum,
        public readonly memories: Array<TMemoryQA | TMemoryUserProfile>,
        public readonly namespace: string[],
        public readonly embeddings: Embeddings,
        /** Internal import keys make replay of a partially written seed set idempotent. */
        public readonly keys?: string[]
    ) {}
}
