import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AcpSession } from '../../acp-session.entity'
import { AcpRuntimeService } from '../../acp-runtime.service'
import { CancelAcpSessionCommand } from '../cancel-acp-session.command'

@CommandHandler(CancelAcpSessionCommand)
export class CancelAcpSessionHandler implements ICommandHandler<CancelAcpSessionCommand, AcpSession> {
  constructor(private readonly runtimeService: AcpRuntimeService) {}

  async execute(command: CancelAcpSessionCommand): Promise<AcpSession> {
    return this.runtimeService.cancelSession(command.sessionId, command.reason)
  }
}
