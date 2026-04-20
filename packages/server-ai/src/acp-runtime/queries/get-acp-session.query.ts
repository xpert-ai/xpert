import { Query } from '@nestjs/cqrs'
import { AcpSession } from '../acp-session.entity'

export class GetAcpSessionQuery extends Query<AcpSession> {
  static readonly type = '[ACP Runtime] Get Session'

  constructor(public readonly sessionId: string) {
    super()
  }
}
