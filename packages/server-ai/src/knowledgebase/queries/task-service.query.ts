import { IQuery } from '@nestjs/cqrs'

export class KnowledgeTaskServiceQuery implements IQuery {
    static readonly type = '[Knowledgebase] Get Task Service'

    constructor(
    ) {}
}
