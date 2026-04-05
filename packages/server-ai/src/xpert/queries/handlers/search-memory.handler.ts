import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { XpertService } from '../../xpert.service'
import { SearchXpertMemoryQuery } from '../search-memory.query'

@QueryHandler(SearchXpertMemoryQuery)
export class SearchXpertMemoryHandler implements IQueryHandler<SearchXpertMemoryQuery> {
    constructor(private readonly service: XpertService) {}

    public async execute(command: SearchXpertMemoryQuery) {
        return this.service.searchMemory(command.xpertId, command.options)
    }
}
