import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ReadThreadControlViewQuery } from './read-thread-control-view.query'
import { ThreadControlViewService } from './thread-control-view.service'

@QueryHandler(ReadThreadControlViewQuery)
export class ReadThreadControlViewHandler implements IQueryHandler<ReadThreadControlViewQuery> {
    constructor(private readonly views: ThreadControlViewService) {}
    execute(query: ReadThreadControlViewQuery) {
        return this.views.read(query.threadId)
    }
}
