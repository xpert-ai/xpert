import { Expose } from 'class-transformer'
import { AcpSessionEvent } from '../acp-session-event.entity'

@Expose()
export class AcpSessionEventDto {
  @Expose()
  id?: string

  @Expose()
  sessionId?: string

  @Expose()
  executionId?: string | null

  @Expose()
  sequence?: number

  @Expose()
  type?: string

  @Expose()
  payload?: Record<string, unknown> | null

  @Expose()
  redactedPayload?: Record<string, unknown> | null

  @Expose()
  createdAt?: Date

  constructor(entity: Partial<AcpSessionEvent>) {
    Object.assign(this, entity)
  }
}
