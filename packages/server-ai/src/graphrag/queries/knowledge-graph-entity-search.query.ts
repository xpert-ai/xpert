import type { IKnowledgebase } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

export class KnowledgeGraphEntitySearchQuery implements IQuery {
    static readonly type = '[KnowledgeGraph] Entity Search'

    constructor(
        public readonly input: {
            knowledgebase: IKnowledgebase
            query: string
            take?: number
            xpertId?: string
            threadId?: string
        }
    ) {}
}
