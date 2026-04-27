import { TAcpObservationPacket, TAcpRuntimePhase } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution/commands'
import { AcpAuditService } from './acp-audit.service'
import { AcpExecutionMapper } from './acp-execution.mapper'
import { AcpSessionEvent } from './acp-session-event.entity'
import { AcpSession } from './acp-session.entity'
import { AcpSessionService } from './acp-session.service'
import { AcpRuntimeEvent } from './backends/acp-backend.types'

const TOOL_UPDATE_DEBOUNCE_MS = 3000

type PendingObservation = {
  timer: NodeJS.Timeout
  packet: TAcpObservationPacket
}

@Injectable()
export class AcpObservationService {
  readonly #logger = new Logger(AcpObservationService.name)
  readonly #pendingToolObservations = new Map<string, PendingObservation>()

  constructor(
    private readonly auditService: AcpAuditService,
    private readonly sessionService: AcpSessionService,
    private readonly executionMapper: AcpExecutionMapper,
    private readonly commandBus: CommandBus
  ) {}

  async handleRawEvent(
    session: AcpSession,
    executionId: string,
    auditEvent: AcpSessionEvent | null,
    event: AcpRuntimeEvent
  ): Promise<void> {
    const candidate = buildObservationPacket(session, executionId, auditEvent?.sequence ?? null, event)
    if (!candidate) {
      return
    }

    const sessionKey = session.id
    if (shouldEmitImmediately(candidate, event)) {
      this.clearPendingObservation(sessionKey)
      await this.emitObservation(session, executionId, candidate)
      return
    }

    this.schedulePendingObservation(session, executionId, candidate)
  }

  async emitQueuedObservation(
    session: AcpSession,
    executionId: string,
    sequence?: number | null,
    headline = '编码任务已委派，等待 Codexpert 开始处理'
  ): Promise<void> {
    await this.emitObservation(session, executionId, {
      sessionId: session.id,
      executionId,
      conversationId: session.conversationId ?? null,
      threadId: session.threadId ?? null,
      sequenceRange: sequence ? [sequence, sequence] : undefined,
      phase: 'queued',
      headline,
      toolName: null,
      toolStatus: null,
      repoId: readString(session.metadata?.repoId) ?? null,
      repoName: readString(session.metadata?.repoName) ?? null,
      branchName: readString(session.metadata?.branchName) ?? null,
      environmentId: readString(session.environmentId) ?? null,
      workspacePath: readString(session.metadata?.workspacePath) ?? readString(session.workingDirectory) ?? null,
      codingAgentName: readString(session.metadata?.codingAgentName) ?? null,
      providerDisplayName: readString(session.metadata?.providerDisplayName) ?? null,
      requiresAttention: false,
      decisionHint: null,
      finalSummary: null,
      error: null,
      artifactRefs: []
    })
  }

  async emitFailureObservation(
    session: AcpSession,
    executionId: string,
    error: string,
    options?: {
      headline?: string
      requiresAttention?: boolean
      sequence?: number | null
    }
  ): Promise<void> {
    await this.emitObservation(session, executionId, {
      sessionId: session.id,
      executionId,
      conversationId: session.conversationId ?? null,
      threadId: session.threadId ?? null,
      sequenceRange: options?.sequence ? [options.sequence, options.sequence] : undefined,
      phase: 'failed',
      headline: options?.headline ?? 'Codexpert execution failed before reporting progress',
      toolName: null,
      toolStatus: null,
      repoId: readString(session.metadata?.repoId) ?? null,
      repoName: readString(session.metadata?.repoName) ?? null,
      branchName: readString(session.metadata?.branchName) ?? null,
      environmentId: readString(session.environmentId) ?? null,
      workspacePath: readString(session.metadata?.workspacePath) ?? readString(session.workingDirectory) ?? null,
      codingAgentName: readString(session.metadata?.codingAgentName) ?? null,
      providerDisplayName: readString(session.metadata?.providerDisplayName) ?? null,
      requiresAttention: options?.requiresAttention ?? false,
      decisionHint: null,
      finalSummary: null,
      error,
      artifactRefs: []
    })
  }

  async flushSession(session: AcpSession, executionId: string): Promise<void> {
    const pending = this.#pendingToolObservations.get(session.id)
    if (!pending) {
      return
    }

    this.#pendingToolObservations.delete(session.id)
    clearTimeout(pending.timer)
    await this.emitObservation(session, executionId, pending.packet)
  }

  clearSession(sessionId: string): void {
    this.clearPendingObservation(sessionId)
  }

  private schedulePendingObservation(session: AcpSession, executionId: string, packet: TAcpObservationPacket) {
    this.clearPendingObservation(session.id)

    const timer = setTimeout(() => {
      this.#pendingToolObservations.delete(session.id)
      void this.emitObservation(session, executionId, packet).catch((error) => {
        this.#logger.warn(
          {
            err: error,
            sessionId: session.id,
            executionId
          },
          'Failed to emit debounced ACP observation packet'
        )
      })
    }, TOOL_UPDATE_DEBOUNCE_MS)

    this.#pendingToolObservations.set(session.id, {
      timer,
      packet
    })
  }

  private clearPendingObservation(sessionId: string) {
    const pending = this.#pendingToolObservations.get(sessionId)
    if (!pending) {
      return
    }

    clearTimeout(pending.timer)
    this.#pendingToolObservations.delete(sessionId)
  }

  private async emitObservation(session: AcpSession, executionId: string, packet: TAcpObservationPacket): Promise<void> {
    const current = await this.sessionService.findOne(session.id)
    if (!current) {
      return
    }

    if (
      current.metadata?.phase === packet.phase &&
      current.metadata?.lastHeadline === packet.headline &&
      !packet.requiresAttention &&
      !packet.finalSummary &&
      !packet.error
    ) {
      return
    }

    const observationEvent = await this.auditService.appendEvent(
      {
        id: current.id,
        tenantId: current.tenantId,
        organizationId: current.organizationId,
        executionId
      } as Pick<AcpSession, 'id' | 'tenantId' | 'organizationId' | 'executionId'>,
      'observation_packet',
      packet as Record<string, unknown>
    )

    await this.sessionService.update(current.id, {
      lastActivityAt: new Date(),
      metadata: {
        ...(current.metadata ?? {}),
        phase: packet.phase,
        lastHeadline: packet.headline,
        lastObservationAt: new Date().toISOString(),
        lastObservationSequence: observationEvent.sequence,
        lastMilestoneAt: new Date().toISOString(),
        lastError: packet.error ?? current.metadata?.lastError ?? null,
        queueState:
          packet.phase === 'completed' || packet.phase === 'failed' || packet.phase === 'canceled'
            ? null
            : current.metadata?.queueState ?? null
      }
    })

    const refreshed = await this.sessionService.findOne(current.id)
    if (executionId) {
      await this.commandBus.execute(
        new XpertAgentExecutionUpsertCommand({
          id: executionId,
          metadata: this.executionMapper.toExecutionMetadata(refreshed, undefined, {
            phase: packet.phase,
            lastObservationAt: refreshed.metadata?.lastObservationAt ?? undefined,
            lastObservationSequence:
              typeof refreshed.metadata?.lastObservationSequence === 'number'
                ? refreshed.metadata.lastObservationSequence
                : undefined
          })
        })
      )
    }

  }
}

function buildObservationPacket(
  session: Pick<AcpSession, 'id' | 'conversationId' | 'threadId' | 'environmentId' | 'workingDirectory' | 'metadata'>,
  executionId: string,
  sequence: number | null,
  event: AcpRuntimeEvent
): TAcpObservationPacket | null {
  if (event.type === 'text_delta' || event.type === 'artifact') {
    return null
  }

  const metadata = session.metadata ?? {}
  const phase = normalizePhase(event)
  if (!phase) {
    return null
  }

  const headline = normalizeHeadline(event)
  if (!headline) {
    return null
  }

  if (event.type === 'status' && !event.isMilestone && phase === 'running') {
    return null
  }

  return {
    sessionId: session.id,
    executionId,
    conversationId: session.conversationId ?? null,
    threadId: session.threadId ?? null,
    sequenceRange: sequence ? [sequence, sequence] : undefined,
    phase,
    headline,
    toolName: readToolName(event),
    toolStatus: readToolStatus(event),
    repoId: readString(metadata.repoId) ?? null,
    repoName: readString(metadata.repoName) ?? null,
    branchName: readString(metadata.branchName) ?? null,
    environmentId: readString(session.environmentId) ?? null,
    workspacePath: readString(metadata.workspacePath) ?? readString(session.workingDirectory) ?? null,
    codingAgentName: readString(metadata.codingAgentName) ?? null,
    providerDisplayName: readString(metadata.providerDisplayName) ?? null,
    requiresAttention: event.requiresAttention ?? phase === 'waiting_input',
    decisionHint: phase === 'waiting_input' ? headline : null,
    finalSummary: event.type === 'done' ? readString(event.summary) ?? readString(event.output) ?? headline : null,
    error: event.type === 'error' ? event.message : null,
    artifactRefs: []
  }
}

function shouldEmitImmediately(packet: TAcpObservationPacket, event: AcpRuntimeEvent): boolean {
  if (packet.requiresAttention || event.final) {
    return true
  }

  if (event.type === 'error' || event.type === 'done') {
    return true
  }

  return packet.phase !== 'running' || event.isMilestone === true && event.type === 'status'
}

function normalizePhase(event: AcpRuntimeEvent): TAcpRuntimePhase | null {
  if (event.phase) {
    return event.phase
  }

  if (event.type === 'done') {
    return event.stopReason === 'cancelled' ? 'canceled' : 'completed'
  }

  if (event.type === 'error') {
    return event.code === 'canceled' ? 'canceled' : 'failed'
  }

  if (event.type === 'tool_call' || event.type === 'tool_call_update') {
    return event.status === 'failed' ? 'failed' : 'running'
  }

  return null
}

function normalizeHeadline(event: AcpRuntimeEvent): string | null {
  if (event.headline) {
    return event.headline
  }

  switch (event.type) {
    case 'status':
      return readString(event.text)
    case 'tool_call':
      return event.title ? `开始执行 ${event.title}` : readString(event.text)
    case 'tool_call_update':
      if (event.title && event.status === 'completed') {
        return `${event.title} 已完成`
      }
      if (event.title && event.status === 'failed') {
        return `${event.title} 执行失败`
      }
      return event.title ? `${event.title} 处理中` : readString(event.text)
    case 'done':
      return readString(event.summary) ?? readString(event.output) ?? '编码执行已完成'
    case 'error':
      return readString(event.message) ?? '编码执行失败'
    default:
      return null
  }
}

function readToolName(event: AcpRuntimeEvent): string | null {
  if (event.type !== 'tool_call' && event.type !== 'tool_call_update') {
    return null
  }

  return readString(event.title) ?? readString(event.text)
}

function readToolStatus(event: AcpRuntimeEvent): string | null {
  if (event.type !== 'tool_call' && event.type !== 'tool_call_update') {
    return null
  }

  return readString(event.status)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
