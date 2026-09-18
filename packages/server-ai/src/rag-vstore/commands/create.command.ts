import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { VectorTypeEnum } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class RagCreateVStoreCommand implements ICommand {
    static readonly type = '[Rag VStore] Create'

    constructor(
        public readonly embeddings: EmbeddingsInterface,
        public readonly config: {
            collectionName?: string
            vectorStore?: VectorTypeEnum | null
        }
    ) {}
}
