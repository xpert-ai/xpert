import { Query } from '@nestjs/cqrs'
import { AcpSessionEvent } from '../acp-session-event.entity'

export class ListAcpSessionEventsQuery extends Query<AcpSessionEvent[]> {
  static readonly type = '[ACP Runtime] List Session Events'

  constructor(public readonly sessionId: string) {
    super()
  }
}
