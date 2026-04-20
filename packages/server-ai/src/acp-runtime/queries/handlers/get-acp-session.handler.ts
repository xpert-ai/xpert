import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AcpRuntimeService } from '../../acp-runtime.service'
import { AcpSession } from '../../acp-session.entity'
import { GetAcpSessionQuery } from '../get-acp-session.query'

@QueryHandler(GetAcpSessionQuery)
export class GetAcpSessionHandler implements IQueryHandler<GetAcpSessionQuery, AcpSession> {
  constructor(private readonly runtimeService: AcpRuntimeService) {}

  async execute(command: GetAcpSessionQuery): Promise<AcpSession> {
    return this.runtimeService.getSession(command.sessionId)
  }
}
