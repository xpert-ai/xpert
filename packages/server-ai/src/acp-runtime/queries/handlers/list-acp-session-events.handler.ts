import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AcpSessionEventService } from '../../acp-session-event.service'
import { AcpSessionEvent } from '../../acp-session-event.entity'
import { ListAcpSessionEventsQuery } from '../list-acp-session-events.query'

@QueryHandler(ListAcpSessionEventsQuery)
export class ListAcpSessionEventsHandler implements IQueryHandler<ListAcpSessionEventsQuery, AcpSessionEvent[]> {
  constructor(private readonly eventService: AcpSessionEventService) {}

  async execute(command: ListAcpSessionEventsQuery): Promise<AcpSessionEvent[]> {
    return this.eventService.listBySession(command.sessionId)
  }
}
