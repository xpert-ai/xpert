import { IAcpSession, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution/commands'
import { AcpArtifactService } from './acp-artifact.service'
import { AcpAuditService } from './acp-audit.service'
import { AcpExecutionMapper } from './acp-execution.mapper'
import { AcpSessionEvent } from './acp-session-event.entity'
import { AcpSession } from './acp-session.entity'
import { AcpSessionService } from './acp-session.service'
import { AcpRuntimeEvent } from './backends/acp-backend.types'

export type ProjectedTurnState = {
  outputText: string
  thoughtText: string
  lastStatusText?: string
  toolUpdates: Array<Record<string, unknown>>
}

export type TurnFinishInput = {
  session: AcpSession
  executionId: string
  requestId: string
  turnIndex: number
  outcome:
    | {
        kind: 'success'
        summary?: string | null
        output?: string | null
        details?: Record<string, unknown>
      }
    | {
        kind: 'error'
        message: string
        code?: string
        details?: Record<string, unknown>
      }
    | {
        kind: 'canceled'
        message: string
      }
  state: ProjectedTurnState
}

@Injectable()
export class AcpEventProjectorService {
  constructor(
    private readonly sessionService: AcpSessionService,
    private readonly auditService: AcpAuditService,
    private readonly artifactService: AcpArtifactService,
    private readonly executionMapper: AcpExecutionMapper,
    private readonly commandBus: CommandBus
  ) {}

  async beginTurn(session: AcpSession, executionId: string, requestId: string, turnIndex: number, prompt: string) {
    const current = await this.sessionService.findOne(session.id)
    await this.sessionService.update(session.id, {
      status: 'running',
      prompt,
      error: null,
      startedAt: new Date(),
      completedAt: null,
      canceledAt: null,
      executionId,
      activeExecutionId: executionId,
      lastExecutionId: executionId,
      lastActivityAt: new Date(),
      metadata: {
        ...(current?.metadata ?? session.metadata ?? {}),
        activeRequestId: requestId,
        lastRequestId: requestId,
        turnIndex
      }
    })

    const refreshed = await this.sessionService.findOne(session.id)
    await this.commandBus.execute(
      new XpertAgentExecutionUpsertCommand({
        id: executionId,
        status: XpertAgentExecutionStatusEnum.RUNNING,
        metadata: this.executionMapper.toExecutionMetadata(refreshed, undefined, {
          acpRequestId: requestId,
          acpTurnIndex: turnIndex
        })
      })
    )

    await this.auditService.appendEvent(refreshed, 'turn_started', {
      executionId,
      requestId,
      turnIndex
    })

    return refreshed
  }

  createState(): ProjectedTurnState {
    return {
      outputText: '',
      thoughtText: '',
      toolUpdates: []
    }
  }

  async projectEvent(
    session: AcpSession,
    executionId: string,
    event: AcpRuntimeEvent,
    state: ProjectedTurnState
  ): Promise<AcpSessionEvent | null> {
    switch (event.type) {
      case 'text_delta':
        if (event.stream === 'thought') {
          state.thoughtText += event.text
        } else if (!shouldSkipOutputText(event, state.outputText)) {
          state.outputText += event.text
        }
        return await this.auditService.appendEvent(session, 'text_delta', {
          executionId,
          stream: event.stream ?? 'output',
          text: event.text,
          tag: event.tag ?? null
        })
      case 'tool_call':
      case 'tool_call_update':
        state.toolUpdates.push({
          toolCallId: event.toolCallId ?? null,
          title: event.title ?? null,
          status: event.status ?? null,
          text: event.text,
          rawInput: event.rawInput ?? null,
          rawOutput: event.rawOutput ?? null
        })
        return await this.auditService.appendEvent(session, event.type, {
          executionId,
          toolCallId: event.toolCallId ?? null,
          title: event.title ?? null,
          status: event.status ?? null,
          text: event.text
        })
      case 'status':
        state.lastStatusText = event.text
        return await this.auditService.appendEvent(session, 'status_update', {
          executionId,
          text: event.text,
          tag: event.tag ?? null,
          details: event.details ?? null
        })
      case 'artifact':
        await this.artifactService.createArtifact(session, {
          kind: event.kind,
          title: event.title ?? null,
          mimeType: event.mimeType ?? null,
          content: event.content ?? null,
          path: event.path ?? null,
          metadata: event.metadata ?? null
        })
        return await this.auditService.appendEvent(session, 'artifact_created', {
          executionId,
          kind: event.kind,
          title: event.title ?? null,
          path: event.path ?? null,
          metadata: event.metadata ?? null
        })
      case 'error':
        return await this.auditService.appendEvent(session, 'status_update', {
          executionId,
          error: event.message,
          code: event.code ?? null,
          details: event.details ?? null
        })
      case 'done':
        return await this.auditService.appendEvent(session, 'status_update', {
          executionId,
          stopReason: event.stopReason ?? null,
          summary: event.summary ?? null
        })
      default:
        return null
    }
  }

  async finishTurn(input: TurnFinishInput) {
    const now = new Date()
    const output = normalizeSummary(input.state.outputText) ?? normalizeSummary(input.outcome.kind === 'success' ? input.outcome.output : null)
    const summary =
      normalizeSummary(input.outcome.kind === 'success' ? input.outcome.summary : null) ??
      normalizeSummary(input.state.lastStatusText) ??
      output ??
      (input.outcome.kind === 'error' || input.outcome.kind === 'canceled' ? input.outcome.message : null)

    if (output) {
      await this.artifactService.createArtifact(input.session, {
        kind: 'stdout',
        title: 'ACP output',
        mimeType: 'text/plain',
        content: output
      })
    }

    if (summary) {
      await this.artifactService.createArtifact(input.session, {
        kind: 'summary',
        title: 'ACP summary',
        mimeType: 'text/plain',
        content: summary
      })
    }

    if (input.state.toolUpdates.length > 0) {
      await this.artifactService.createArtifact(input.session, {
        kind: 'tool_summary',
        title: 'ACP tool summary',
        mimeType: 'application/json',
        content: JSON.stringify(input.state.toolUpdates, null, 2)
      })
    }

    const executionStatus = resolveExecutionStatus(input.outcome.kind)
    const sessionStatus = resolveSessionStatus(input.session.mode, input.outcome.kind)
    const error = input.outcome.kind === 'error' || input.outcome.kind === 'canceled' ? input.outcome.message : null

    await this.commandBus.execute(
      new XpertAgentExecutionUpsertCommand({
        id: input.executionId,
        status: executionStatus,
        error: error ?? undefined,
        outputs: {
          output: output ?? summary ?? ''
        },
        metadata: this.executionMapper.toExecutionMetadata(input.session, undefined, {
          acpRequestId: input.requestId,
          acpTurnIndex: input.turnIndex,
          sessionStatus
        })
      })
    )

    const current = await this.sessionService.findOne(input.session.id)
    const phase =
      input.outcome.kind === 'success'
        ? 'completed'
        : input.outcome.kind === 'canceled'
          ? 'canceled'
          : 'failed'
    await this.sessionService.update(input.session.id, {
      status: sessionStatus,
      summary,
      error,
      completedAt: now,
      canceledAt: input.outcome.kind === 'canceled' ? now : null,
      activeExecutionId: null,
      executionId: input.executionId,
      lastExecutionId: input.executionId,
      lastActivityAt: now,
      metadata: {
        ...(current?.metadata ?? input.session.metadata ?? {}),
        activeRequestId: null,
        lastRequestId: input.requestId,
        lastTurnStatus: sessionStatus,
        turnIndex: input.turnIndex,
        phase,
        lastHeadline: summary ?? error ?? current?.metadata?.lastHeadline ?? null,
        lastError: error,
        queueState: null
      }
    })

    const refreshed = await this.sessionService.findOne(input.session.id)
    await this.auditService.appendEvent(
      refreshed,
      input.outcome.kind === 'success'
        ? 'turn_completed'
        : input.outcome.kind === 'canceled'
          ? 'turn_canceled'
          : 'turn_failed',
      {
        executionId: input.executionId,
        requestId: input.requestId,
        turnIndex: input.turnIndex,
        summary,
        error
      }
    )

    if (input.session.mode === 'oneshot' && input.outcome.kind === 'success') {
      await this.auditService.appendEvent(refreshed, 'session_completed', {
        executionId: input.executionId,
        requestId: input.requestId
      })
    }

    return refreshed
  }
}

function normalizeSummary(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function shouldSkipOutputText(event: Extract<AcpRuntimeEvent, { type: 'text_delta' }>, currentOutput: string) {
  if (event.tag !== 'assistant_snapshot') {
    return false
  }

  const normalizedEvent = normalizeSummary(event.text)?.replace(/\s+/g, ' ').trim().toLowerCase()
  const normalizedOutput = normalizeSummary(currentOutput)?.replace(/\s+/g, ' ').trim().toLowerCase()
  return Boolean(normalizedEvent && normalizedOutput && normalizedEvent === normalizedOutput)
}

function resolveExecutionStatus(kind: TurnFinishInput['outcome']['kind']): XpertAgentExecutionStatusEnum {
  switch (kind) {
    case 'success':
      return XpertAgentExecutionStatusEnum.SUCCESS
    case 'canceled':
      return XpertAgentExecutionStatusEnum.INTERRUPTED
    case 'error':
    default:
      return XpertAgentExecutionStatusEnum.ERROR
  }
}

function resolveSessionStatus(mode: IAcpSession['mode'], kind: TurnFinishInput['outcome']['kind']): IAcpSession['status'] {
  if (kind === 'canceled') {
    return mode === 'persistent' ? 'ready' : 'canceled'
  }
  if (kind === 'error') {
    return mode === 'persistent' ? 'ready' : 'error'
  }
  return mode === 'persistent' ? 'ready' : 'success'
}
