import { Command } from '@nestjs/cqrs'
import { AcpSession } from '../acp-session.entity'

export class CancelAcpSessionCommand extends Command<AcpSession> {
  static readonly type = '[ACP Runtime] Cancel Session'

  constructor(
    public readonly sessionId: string,
    public readonly reason?: string
  ) {
    super()
  }
}
