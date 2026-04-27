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
  targetRef?: string | null

  @Expose()
  targetKind?: string | null

  @Expose()
  transport?: string | null

  @Expose()
  mode?: string

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
  activeExecutionId?: string | null

  @Expose()
  lastExecutionId?: string | null

  @Expose()
  parentExecutionId?: string | null

  @Expose()
  environmentId?: string | null

  @Expose()
  conversationId?: string | null

  @Expose()
  threadId?: string | null

  @Expose()
  clientSessionId?: string | null

  @Expose()
  backendSessionId?: string | null

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
  lastActivityAt?: Date | null

  @Expose()
  lastExitCode?: number | null

  @Expose()
  metadata?: Record<string, unknown> | null

  @Expose()
  phase?: string | null

  @Expose()
  queueState?: Record<string, unknown> | null

  @Expose()
  lastHeadline?: string | null

  @Expose()
  lastObservationAt?: string | null

  @Expose()
  lastObservationSequence?: number | null

  @Expose()
  lastConsumedObservationSequence?: number | null

  @Expose()
  lastReportedObservationSequence?: number | null

  @Expose()
  lastProjectedSequence?: number | null

  @Expose()
  lastProjectedTextSequence?: number | null

  @Expose()
  lastProjectedHeadline?: string | null

  @Expose()
  sourceConversationId?: string | null

  @Expose()
  resumeThreadId?: string | null

  @Expose()
  effectiveUserId?: string | null

  @Expose()
  createdAt?: Date

  @Expose()
  updatedAt?: Date

  constructor(entity: Partial<AcpSession>) {
    Object.assign(this, entity)
    const metadata = (entity.metadata ?? {}) as Record<string, unknown>
    this.phase = typeof metadata.phase === 'string' ? metadata.phase : null
    this.queueState =
      metadata.queueState && typeof metadata.queueState === 'object' && !Array.isArray(metadata.queueState)
        ? (metadata.queueState as Record<string, unknown>)
        : null
    this.lastHeadline = typeof metadata.lastHeadline === 'string' ? metadata.lastHeadline : null
    this.lastObservationAt = typeof metadata.lastObservationAt === 'string' ? metadata.lastObservationAt : null
    this.lastObservationSequence =
      typeof metadata.lastObservationSequence === 'number' ? metadata.lastObservationSequence : null
    this.lastConsumedObservationSequence =
      typeof metadata.lastConsumedObservationSequence === 'number' ? metadata.lastConsumedObservationSequence : null
    this.lastReportedObservationSequence =
      typeof metadata.lastReportedObservationSequence === 'number' ? metadata.lastReportedObservationSequence : null
    this.lastProjectedSequence =
      typeof metadata.lastProjectedSequence === 'number' ? metadata.lastProjectedSequence : null
    this.lastProjectedTextSequence =
      typeof metadata.lastProjectedTextSequence === 'number' ? metadata.lastProjectedTextSequence : null
    this.lastProjectedHeadline = typeof metadata.lastProjectedHeadline === 'string' ? metadata.lastProjectedHeadline : null
    this.sourceConversationId = typeof metadata.sourceConversationId === 'string' ? metadata.sourceConversationId : null
    this.resumeThreadId = typeof metadata.resumeThreadId === 'string' ? metadata.resumeThreadId : null
    this.effectiveUserId =
      typeof metadata.effectiveUserId === 'string'
        ? metadata.effectiveUserId
        : typeof metadata.userId === 'string'
          ? metadata.userId
          : null
  }
}
