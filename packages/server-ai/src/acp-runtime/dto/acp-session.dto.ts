import { Expose } from 'class-transformer'
import { AcpSession } from '../acp-session.entity'

@Expose()
export class AcpSessionDto {
  @Expose()
  id?: string

  @Expose()
  title?: string | null

  @Expose()
  harnessType?: string

  @Expose()
  permissionProfile?: string

  @Expose()
  status?: string

  @Expose()
  summary?: string | null

  @Expose()
  error?: string | null

  @Expose()
  executionId?: string | null

  @Expose()
  parentExecutionId?: string | null

  @Expose()
  environmentId?: string | null

  @Expose()
  workingDirectory?: string | null

  @Expose()
  timeoutMs?: number | null

  @Expose()
  startedAt?: Date | null

  @Expose()
  completedAt?: Date | null

  @Expose()
  canceledAt?: Date | null

  @Expose()
  lastExitCode?: number | null

  @Expose()
  metadata?: Record<string, unknown> | null

  @Expose()
  createdAt?: Date

  @Expose()
  updatedAt?: Date

  constructor(entity: Partial<AcpSession>) {
    Object.assign(this, entity)
  }
}
