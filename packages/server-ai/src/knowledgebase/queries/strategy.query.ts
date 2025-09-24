import { IQuery } from '@nestjs/cqrs'

export class KnowledgeStrategyQuery implements IQuery {
    static readonly type = '[Knowledgebase] Get Strategy'

    constructor(
        public readonly input: {
            type: 'source' | 'processor' | 'chunker' | 'understanding';
            name: string
        }
    ) {}
}
