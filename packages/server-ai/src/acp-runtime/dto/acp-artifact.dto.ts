import { Expose } from 'class-transformer'
import { AcpArtifact } from '../acp-artifact.entity'

@Expose()
export class AcpArtifactDto {
  @Expose()
  id?: string

  @Expose()
  sessionId?: string

  @Expose()
  executionId?: string | null

  @Expose()
  kind?: string

  @Expose()
  title?: string | null

  @Expose()
  mimeType?: string | null

  @Expose()
  content?: string | null

  @Expose()
  path?: string | null

  @Expose()
  metadata?: Record<string, unknown> | null

  @Expose()
  createdAt?: Date

  constructor(entity: Partial<AcpArtifact>) {
    Object.assign(this, entity)
  }
}
