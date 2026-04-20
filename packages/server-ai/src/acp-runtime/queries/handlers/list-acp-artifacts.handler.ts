import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AcpArtifactService } from '../../acp-artifact.service'
import { AcpArtifact } from '../../acp-artifact.entity'
import { ListAcpArtifactsQuery } from '../list-acp-artifacts.query'

@QueryHandler(ListAcpArtifactsQuery)
export class ListAcpArtifactsHandler implements IQueryHandler<ListAcpArtifactsQuery, AcpArtifact[]> {
  constructor(private readonly artifactService: AcpArtifactService) {}

  async execute(command: ListAcpArtifactsQuery): Promise<AcpArtifact[]> {
    return this.artifactService.listBySession(command.sessionId)
  }
}
