import { IQuery } from '@nestjs/cqrs'

/**
 * @deprecated use KnowledgebaseTaskService directly
 */
export class KnowledgeTaskServiceQuery implements IQuery {
    static readonly type = '[Knowledgebase] Get Task Service'

    constructor(
    ) {}
}
