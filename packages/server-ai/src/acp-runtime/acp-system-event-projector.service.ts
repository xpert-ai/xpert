import { IChatMessage, TAcpRuntimePhase, TAcpSystemEventMessage } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ChatConversationService } from '../chat-conversation'
import { ChatMessageUpsertCommand } from '../chat-message/commands/upsert.command'
import { AcpSession } from './acp-session.entity'
import { AcpSessionEvent } from './acp-session-event.entity'
import { AcpSessionService } from './acp-session.service'
import { AcpRuntimeEvent } from './backends/acp-backend.types'

const TEXT_DEBOUNCE_MS = 2000
const TEXT_SOFT_FLUSH_CHARS = 500
const TEXT_MAX_CHARS = 800

type PendingTextProjection = {
  timer: NodeJS.Timeout
  text: string
  phase: TAcpRuntimePhase | null
  startSequence: number | null
  endSequence: number | null
}

type ProjectableSession = Pick<AcpSession, 'id' | 'conversationId' | 'metadata'>

@Injectable()
export class AcpSystemEventProjectorService {
  readonly #logger = new Logger(AcpSystemEventProjectorService.name)
  readonly #pendingTextBySession = new Map<string, PendingTextProjection>()
  readonly #lastProjectedNormalizedText = new Map<string, string>()

  constructor(
    private readonly sessionService: AcpSessionService,
    private readonly conversationService: ChatConversationService,
    private readonly commandBus: CommandBus
  ) {}

  async handleRawEvent(
    session: ProjectableSession,
    executionId: string,
    auditEvent: AcpSessionEvent | null,
    event: AcpRuntimeEvent
  ): Promise<void> {
    if (!readString(session.conversationId)) {
      return
    }

    if (event.type === 'artifact') {
      return
    }

    if (event.type === 'text_delta') {
      await this.handleTextDelta(session, executionId, auditEvent, event)
      return
    }

    await this.flushSession(session, executionId)

    if (!shouldProjectEvent(event)) {
      return
    }

    const sequence = typeof auditEvent?.sequence === 'number' ? auditEvent.sequence : null
    const current = await this.sessionService.findOne(session.id)
    if (!current || !readString(current.conversationId)) {
      return
    }

    const phase = normalizePhase(event.phase) ?? normalizePhase(current.metadata?.phase)
    if (phase === 'queued' && hasAdvancedBeyondQueued(current.metadata?.phase)) {
      return
    }

    const headline = resolveHeadline(event)
    if (!headline) {
      return
    }

    const alreadyProjectedSequence =
      typeof current.metadata?.lastProjectedSequence === 'number' ? current.metadata.lastProjectedSequence : null
    if (sequence !== null && alreadyProjectedSequence !== null && sequence <= alreadyProjectedSequence) {
      return
    }

    if (
      sequence === null &&
      normalizePhase(current.metadata?.phase) === phase &&
      readString(current.metadata?.lastProjectedHeadline) === headline
    ) {
      return
    }

    await this.projectVisibleMessage(current, headline, {
      executionId,
      phase,
      sequence,
      toolName: resolveToolName(event),
      toolStatus: resolveToolStatus(event),
      requiresAttention: event.requiresAttention ?? phase === 'waiting_input',
      final: event.final ?? (event.type === 'done' || event.type === 'error')
    })
  }

  async emitQueuedSystemEvent(
    session: ProjectableSession,
    executionId: string,
    sequence?: number | null,
    headline = '编码任务已委派，等待 Codexpert 开始处理'
  ): Promise<void> {
    const current = await this.sessionService.findOne(session.id)
    if (!current || !readString(current.conversationId)) {
      return
    }

    if (hasAdvancedBeyondQueued(current.metadata?.phase)) {
      return
    }

    await this.projectVisibleMessage(current, headline, {
      executionId,
      phase: 'queued',
      sequence: typeof sequence === 'number' ? sequence : null,
      requiresAttention: false,
      final: false
    })
  }

  async emitFailureSystemEvent(
    session: ProjectableSession,
    executionId: string,
    message: string,
    options?: {
      headline?: string
      phase?: TAcpRuntimePhase | null
      requiresAttention?: boolean
    }
  ): Promise<void> {
    const current = await this.sessionService.findOne(session.id)
    if (!current || !readString(current.conversationId)) {
      return
    }

    const headline = readString(options?.headline) ?? readString(message) ?? 'Codexpert execution failed'
    const content = normalizeDistinctLines([headline, readString(message)])
    await this.projectVisibleMessage(current, content, {
      executionId,
      phase: options?.phase ?? 'failed',
      sequence: null,
      requiresAttention: options?.requiresAttention ?? true,
      final: true,
      headline
    })
  }

  async emitCanceledSystemEvent(
    session: ProjectableSession,
    executionId: string | null | undefined,
    reason: string
  ): Promise<void> {
    const current = await this.sessionService.findOne(session.id)
    if (!current || !readString(current.conversationId)) {
      return
    }

    const headline = readString(reason) ?? 'Codexpert execution canceled'
    await this.projectVisibleMessage(current, headline, {
      executionId: executionId ?? null,
      phase: 'canceled',
      sequence: null,
      requiresAttention: false,
      final: true,
      headline
    })
  }

  async flushSession(session: ProjectableSession, executionId: string): Promise<void> {
    const pending = this.#pendingTextBySession.get(session.id)
    if (!pending) {
      return
    }

    this.#pendingTextBySession.delete(session.id)
    clearTimeout(pending.timer)

    const current = await this.sessionService.findOne(session.id)
    if (!current || !readString(current.conversationId)) {
      return
    }

    const text = pending.text.trim()
    if (!text) {
      return
    }

    const { content, truncated } = truncateText(text, TEXT_MAX_CHARS)
    const normalizedContent = normalizeProjectionText(content)
    if (!normalizedContent) {
      return
    }

    if (this.#lastProjectedNormalizedText.get(session.id) === normalizedContent) {
      return
    }

    const lastProjectedTextSequence =
      typeof current.metadata?.lastProjectedTextSequence === 'number' ? current.metadata.lastProjectedTextSequence : null
    if (pending.endSequence !== null && lastProjectedTextSequence !== null && pending.endSequence <= lastProjectedTextSequence) {
      return
    }

    this.#lastProjectedNormalizedText.set(session.id, normalizedContent)

    await this.projectVisibleMessage(current, content, {
      executionId,
      phase: pending.phase ?? normalizePhase(current.metadata?.phase),
      sequence: null,
      sequenceRange:
        pending.startSequence !== null && pending.endSequence !== null
          ? [pending.startSequence, pending.endSequence]
          : undefined,
      requiresAttention: false,
      final: false,
      headline: 'Codexpert 输出更新',
      liveText: true,
      truncated
    })
  }

  clearSession(sessionId: string): void {
    const pending = this.#pendingTextBySession.get(sessionId)
    if (pending) {
      clearTimeout(pending.timer)
      this.#pendingTextBySession.delete(sessionId)
    }
    this.#lastProjectedNormalizedText.delete(sessionId)
  }

  private async handleTextDelta(
    session: ProjectableSession,
    executionId: string,
    auditEvent: AcpSessionEvent | null,
    event: Extract<AcpRuntimeEvent, { type: 'text_delta' }>
  ) {
    if (event.stream === 'thought') {
      return
    }

    const delta = event.text
    if (!delta.trim()) {
      return
    }

    const sequence = typeof auditEvent?.sequence === 'number' ? auditEvent.sequence : null
    const current = await this.sessionService.findOne(session.id)
    if (!current || !readString(current.conversationId)) {
      return
    }

    const existing = this.#pendingTextBySession.get(session.id)
    const phase = normalizePhase(event.phase) ?? normalizePhase(current.metadata?.phase) ?? 'running'
    const nextText = `${existing?.text ?? ''}${delta}`

    if (existing) {
      clearTimeout(existing.timer)
    }

    const timer = setTimeout(() => {
      void this.flushSession(session, executionId).catch((error) => {
        this.#logger.warn(
          {
            err: error,
            sessionId: session.id,
            executionId
          },
          'Failed to flush ACP live text projection'
        )
      })
    }, TEXT_DEBOUNCE_MS)

    this.#pendingTextBySession.set(session.id, {
      timer,
      text: nextText,
      phase,
      startSequence: existing?.startSequence ?? sequence,
      endSequence: sequence ?? existing?.endSequence ?? null
    })

    if (shouldFlushLiveText(nextText)) {
      await this.flushSession(session, executionId)
    }
  }

  private async projectVisibleMessage(
    session: AcpSession,
    content: string,
    input: {
      executionId?: string | null
      phase?: TAcpRuntimePhase | null
      sequence?: number | null
      sequenceRange?: [number, number]
      toolName?: string | null
      toolStatus?: string | null
      requiresAttention?: boolean
      final?: boolean
      headline?: string | null
      liveText?: boolean
      truncated?: boolean
    }
  ): Promise<void> {
    const normalizedContent = content.trim()
    if (!normalizedContent || !readString(session.conversationId)) {
      return
    }

    const headline = readString(input.headline) ?? normalizedContent
    const current = await this.sessionService.findOne(session.id)
    if (!current || !readString(current.conversationId)) {
      return
    }

    if (
      input.sequence === null &&
      normalizePhase(current.metadata?.phase) === normalizePhase(input.phase) &&
      readString(current.metadata?.lastProjectedHeadline) === headline
    ) {
      return
    }

    const conversation = await this.conversationService.findOne(current.conversationId, { relations: ['messages'] })
    const visibleMessages = (conversation?.messages ?? []).filter((message) => !message.deletedAt)
    const parent = visibleMessages.length ? ({ id: visibleMessages[visibleMessages.length - 1].id } as IChatMessage) : null

    const payload: TAcpSystemEventMessage = {
      type: 'acp_system_event',
      source: 'codexpert',
      origin: 'system',
      acpSessionId: current.id,
      executionId: readString(input.executionId) ?? null,
      phase: normalizePhase(input.phase),
      headline,
      ...(typeof input.sequence === 'number' ? { sequence: input.sequence } : {}),
      ...(input.sequenceRange ? { sequenceRange: input.sequenceRange } : {}),
      ...(readString(input.toolName) ? { toolName: readString(input.toolName) } : {}),
      ...(readString(input.toolStatus) ? { toolStatus: readString(input.toolStatus) } : {}),
      ...(typeof input.requiresAttention === 'boolean' ? { requiresAttention: input.requiresAttention } : {}),
      ...(typeof input.final === 'boolean' ? { final: input.final } : {}),
      ...(input.liveText ? { liveText: true } : {}),
      ...(input.truncated ? { truncated: true } : {})
    }

    await this.commandBus.execute(
      new ChatMessageUpsertCommand({
        parent,
        role: 'human',
        content: normalizedContent,
        conversationId: current.conversationId,
        executionId: readString(input.executionId) ?? undefined,
        visibleAt: new Date(),
        thirdPartyMessage: payload
      })
    )

    await this.sessionService.update(current.id, {
      lastActivityAt: new Date(),
      metadata: {
        ...(current.metadata ?? {}),
        ...(typeof input.sequence === 'number' ? { lastProjectedSequence: input.sequence } : {}),
        ...(input.sequenceRange ? { lastProjectedTextSequence: input.sequenceRange[1] } : {}),
        lastProjectedHeadline: headline
      }
    })
  }
}

function shouldProjectEvent(event: AcpRuntimeEvent): boolean {
  switch (event.type) {
    case 'status':
      return !!resolveHeadline(event)
    case 'tool_call':
      return true
    case 'tool_call_update':
      return isTerminalToolStatus(event.status) || event.isMilestone === true || event.requiresAttention === true
    case 'done':
    case 'error':
      return true
    default:
      return false
  }
}

function shouldFlushLiveText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }

  if (trimmed.length >= TEXT_SOFT_FLUSH_CHARS) {
    return true
  }

  if (/\n\n$/.test(text)) {
    return true
  }

  return /[.!?。！？]\s*$/.test(trimmed)
}

function resolveHeadline(event: AcpRuntimeEvent): string | null {
  if (readString(event.headline)) {
    return readString(event.headline)
  }

  switch (event.type) {
    case 'status':
      return readString(event.text)
    case 'tool_call':
    case 'tool_call_update':
      return readString(event.title) ?? readString(event.text)
    case 'done':
      return readString(event.summary) ?? readString(event.output) ?? 'Codexpert task completed'
    case 'error':
      return readString(event.message) ?? 'Codexpert execution failed'
    default:
      return null
  }
}

function resolveToolName(event: AcpRuntimeEvent): string | null {
  if (event.type !== 'tool_call' && event.type !== 'tool_call_update') {
    return null
  }

  return readString(event.title)
}

function resolveToolStatus(event: AcpRuntimeEvent): string | null {
  if (event.type !== 'tool_call' && event.type !== 'tool_call_update') {
    return null
  }

  return readString(event.status)
}

function isTerminalToolStatus(status: unknown): boolean {
  const normalized = readString(status)?.toLowerCase()
  return normalized === 'completed' || normalized === 'failed' || normalized === 'cancelled' || normalized === 'canceled'
}

function hasAdvancedBeyondQueued(value: unknown): boolean {
  const phase = normalizePhase(value)
  return phase !== null && phase !== 'queued'
}

function normalizePhase(value: unknown): TAcpRuntimePhase | null {
  if (typeof value !== 'string') {
    return null
  }

  switch (value) {
    case 'queued':
    case 'setup':
    case 'running':
    case 'waiting_input':
    case 'completed':
    case 'failed':
    case 'canceled':
      return value
    default:
      return null
  }
}

function truncateText(value: string, maxChars: number): { content: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return {
      content: value,
      truncated: false
    }
  }

  if (maxChars <= 1) {
    return {
      content: value.slice(0, maxChars),
      truncated: true
    }
  }

  return {
    content: `${value.slice(0, maxChars - 1)}…`,
    truncated: true
  }
}

function normalizeProjectionText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeDistinctLines(lines: Array<string | null>): string {
  const result: string[] = []
  for (const line of lines) {
    const normalized = readString(line)
    if (!normalized) {
      continue
    }
    if (result[result.length - 1] === normalized) {
      continue
    }
    result.push(normalized)
  }
  return result.join('\n')
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
