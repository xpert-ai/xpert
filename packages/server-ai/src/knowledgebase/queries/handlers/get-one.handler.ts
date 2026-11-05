import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { Knowledgebase } from '../../persistence/knowledgebase.entity'
import { KnowledgebaseService } from '../../management/knowledgebase.service'
import { KnowledgebaseGetOneQuery } from '../get-one.query'

@QueryHandler(KnowledgebaseGetOneQuery)
export class KnowledgebaseGetOneHandler implements IQueryHandler<KnowledgebaseGetOneQuery> {
    private readonly logger = new Logger(KnowledgebaseGetOneHandler.name)

    constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

    public async execute(command: KnowledgebaseGetOneQuery): Promise<Knowledgebase> {
        const { id, options } = command.input
        return command.input.purpose === 'retrieval'
            ? this.knowledgebaseService.findOneForSearch(id, options)
            : this.knowledgebaseService.findOne(id, options)
    }
}
