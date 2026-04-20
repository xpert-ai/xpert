import { Query } from '@nestjs/cqrs'
import { AcpArtifact } from '../acp-artifact.entity'

export class ListAcpArtifactsQuery extends Query<AcpArtifact[]> {
  static readonly type = '[ACP Runtime] List Artifacts'

  constructor(public readonly sessionId: string) {
    super()
  }
}
