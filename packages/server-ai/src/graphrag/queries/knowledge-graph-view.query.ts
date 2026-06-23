import { IQuery } from '@nestjs/cqrs'
import type { KnowledgeGraphVisualizationQuery } from '@xpert-ai/contracts'

export class KnowledgeGraphViewQuery implements IQuery {
    static readonly type = '[KnowledgeGraph] View'

    constructor(
        public readonly input: {
            knowledgebaseId: string
            query?: KnowledgeGraphVisualizationQuery
        }
    ) {}
}
