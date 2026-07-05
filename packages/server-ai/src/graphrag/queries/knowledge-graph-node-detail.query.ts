import { IQuery } from '@nestjs/cqrs'
import type { KnowledgeGraphEntityChunksQuery } from '@xpert-ai/contracts'

export class KnowledgeGraphNodeDetailQuery implements IQuery {
    static readonly type = '[KnowledgeGraph] Node Detail'

    constructor(
        public readonly input: {
            knowledgebaseId: string
            entityId: string
            query?: KnowledgeGraphEntityChunksQuery
        }
    ) {}
}
