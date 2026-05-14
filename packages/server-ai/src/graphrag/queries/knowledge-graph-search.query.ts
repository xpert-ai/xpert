import { IQuery } from '@nestjs/cqrs'
import { TKnowledgeGraphSearchInput } from '../types'

export class KnowledgeGraphSearchQuery implements IQuery {
    static readonly type = '[KnowledgeGraph] Search'

    constructor(public readonly input: TKnowledgeGraphSearchInput) {}
}
