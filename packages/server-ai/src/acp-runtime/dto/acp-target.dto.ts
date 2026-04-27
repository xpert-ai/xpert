import { Expose } from 'class-transformer'
import { AcpTarget } from '../acp-target.entity'

@Expose()
export class AcpTargetDto {
  @Expose()
  id?: string

  @Expose()
  label?: string

  @Expose()
  description?: string | null

  @Expose()
  kind?: string

  @Expose()
  transport?: string

  @Expose()
  commandOrEndpoint?: string | null

  @Expose()
  authRef?: string | null

  @Expose()
  defaultMode?: string

  @Expose()
  permissionProfile?: string

  @Expose()
  timeoutSeconds?: number | null

  @Expose()
  enabled?: boolean

  @Expose()
  capabilities?: Record<string, unknown> | null

  @Expose()
  metadata?: Record<string, unknown> | null

  @Expose()
  builtin?: boolean

  constructor(entity: Partial<AcpTarget>) {
    Object.assign(this, entity)
  }
}
