import {
  IAcpSession,
  TAcpRuntimePhase,
  THarnessType,
  XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { StopHandoffMessageCommand } from '../handoff/commands'
import { ExecutionCancelService } from '../shared'
import { requireBusinessPrincipal, requireCurrentBusinessPrincipal } from '../shared/identity'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution/commands'
import { XpertAgentExecutionService } from '../xpert-agent-execution/agent-execution.service'
import { AcpArtifactService } from './acp-artifact.service'
import { AcpAuditService } from './acp-audit.service'
import { AcpExecutionMapper } from './acp-execution.mapper'
import { AcpEventProjectorService } from './acp-event-projector.service'
import { AcpObservationService } from './acp-observation.service'
import { AcpSessionEventService } from './acp-session-event.service'
import { AcpRuntimeEvent, IAcpBackend, ResolvedAcpTarget, normalizeTargetTimeoutMs, resolveTargetHarnessType, resolveTargetMode, resolveTargetPermissionProfile } from './backends/acp-backend.types'
import { AcpBackendRegistry } from './backends/acp-backend.registry'
import { AcpTargetRegistry } from './backends/acp-target.registry'
import { ACP_TASK_MESSAGE_TYPE } from './handoff.contract'
import { AcpSession } from './acp-session.entity'
import { AcpSessionService } from './acp-session.service'
import { AcpSystemEventProjectorService } from './acp-system-event-projector.service'
import { AcpTarget } from './acp-target.entity'
import { AcpTargetService } from './acp-target.service'
import { CreateAcpSubExecutionInput, CreateAcpSubExecutionResult } from './commands/create-acp-sub-execution.command'
import { EnsureAcpSessionInput, RunAcpTurnInput, RunAcpTurnResult } from './acp-runtime.types'

const DEFAULT_ACP_TIMEOUT_MS = 15 * 60 * 1000

type PreparedTurn = {
  session: AcpSession
  target: ResolvedAcpTarget
  backend: IAcpBackend
  executionId: string
  requestId: string
  turnIndex: number
  prompt: string
  promptMode: 'prompt' | 'steer'
  timeoutMs: number
  signal?: AbortSignal
}

@Injectable()
export class AcpRuntimeService {
  readonly #logger = new Logger(AcpRuntimeService.name)
  readonly #promptQueueTails = new Map<string, Promise<void>>()
  readonly #promptQueueDepth = new Map<string, number>()

  constructor(
    private readonly sessionService: AcpSessionService,
    private readonly sessionEventService: AcpSessionEventService,
    private readonly targetService: AcpTargetService,
    private readonly targetRegistry: AcpTargetRegistry,
    private readonly executionService: XpertAgentExecutionService,
    private readonly auditService: AcpAuditService,
    private readonly artifactService: AcpArtifactService,
    private readonly executionMapper: AcpExecutionMapper,
    private readonly projector: AcpEventProjectorService,
    private readonly observationService: AcpObservationService,
    private readonly systemEventProjector: AcpSystemEventProjectorService,
    private readonly backendRegistry: AcpBackendRegistry,
    private readonly commandBus: CommandBus,
    private readonly handoffQueue: HandoffQueueService,
    private readonly executionCancelService: ExecutionCancelService
  ) {}

  async listTargets(): Promise<ResolvedAcpTarget[]> {
    return await this.targetRegistry.listVisibleTargets()
  }

  async getSession(sessionId: string): Promise<AcpSession> {
    const session = await this.sessionService.findOne(sessionId)
    if (!session) {
      throw new NotFoundException(`ACP session ${sessionId} not found`)
    }
    return session
  }

  async listSessionEvents(sessionId: string) {
    await this.getSession(sessionId)
    return await this.sessionEventService.listBySession(sessionId)
  }

  async listArtifacts(sessionId: string) {
    await this.getSession(sessionId)
    return await this.artifactService.listBySession(sessionId)
  }

  async listSessions(filter?: { conversationId?: string; xpertId?: string; targetKind?: AcpSession['targetKind'] }) {
    return await this.sessionService.listSessions(filter)
  }

  async getSessionStatus(sessionId: string) {
    const session = await this.getSession(sessionId)
    return this.toSessionStatus(session)
  }

  async interveneSession(
    sessionId: string,
    input: {
      type: 'queue' | 'interrupt'
      prompt?: string
      title?: string
      reason?: string
      timeoutMs?: number
    }
  ) {
    const session = await this.getSession(sessionId)
    const type = input.type

    if (type === 'interrupt') {
      const canceled = await this.cancelSession(sessionId, input.reason ?? 'Interrupted by ACP observer')
      if (input.prompt) {
        void this.runTurnBuffered({
          sessionId,
          prompt: input.prompt,
          title: input.title,
          timeoutMs: input.timeoutMs
        }).catch((error) => {
          this.#logger.error(
            {
              err: error,
              sessionId,
              mode: type
            },
            'Failed to run interrupt follow-up ACP prompt'
          )
        })
      }

      return {
        accepted: true,
        mode: type,
        session: await this.toSessionStatus(canceled)
      }
    }

    if (!input.prompt) {
      const refreshed = await this.sessionService.update(session.id, {
        metadata: {
          ...(session.metadata ?? {}),
          queueState: {
            status: 'queued',
            position: Math.max(1, (this.#promptQueueDepth.get(sessionId) ?? 0) + 1),
            queuedAt: new Date().toISOString(),
            note: 'Queued by ACP intervention'
          }
        }
      })

      return {
        accepted: true,
        mode: type,
        session: await this.toSessionStatus(refreshed)
      }
    }

    void this.runTurnBuffered({
      sessionId,
      prompt: input.prompt,
      title: input.title,
      timeoutMs: input.timeoutMs
    }).catch((error) => {
      this.#logger.error(
        {
          err: error,
          sessionId,
          mode: type
        },
        'Failed to run queued ACP prompt'
      )
    })

    const current = await this.getSession(sessionId)
    return {
      accepted: true,
      mode: type,
      session: await this.toSessionStatus(current)
    }
  }

  async ensureSession(input: EnsureAcpSessionInput): Promise<AcpSession> {
    if (input.sessionId) {
      return await this.getSession(input.sessionId)
    }

    const target = await this.resolveTarget(input)
    const permissionProfile = resolveTargetPermissionProfile(target, input.permissionProfile)
    const mode = resolveTargetMode(target, input.mode)
    const timeoutMs = normalizeTimeoutMs(input.timeoutMs, target)

    if (input.reuseSession) {
      const reusable = await this.sessionService.findReusableSession({
        targetRef: target.id,
        targetKind: target.kind,
        conversationId: input.conversationId ?? null,
        threadId: input.threadId ?? null,
        xpertId: input.xpertId ?? null,
        parentExecutionId: input.parentExecutionId ?? null,
        environmentId: input.environmentId ?? null,
        workingDirectory: input.workingDirectory ?? null,
        metadata: input.metadata ?? null
      })
      if (reusable) {
        await this.sessionService.update(reusable.id, {
          title: input.title ?? reusable.title ?? target.label,
          targetRef: target.id,
          targetKind: target.kind,
          transport: target.transport,
          permissionProfile,
          timeoutMs,
          environmentId: input.environmentId ?? reusable.environmentId ?? null,
          workingDirectory: input.workingDirectory ?? reusable.workingDirectory ?? null,
          lastActivityAt: new Date(),
          metadata: mergeSessionMetadata(reusable.metadata, input.metadata, target, input.workingDirectory)
        })
        const refreshed = await this.getSession(reusable.id)
        await this.auditService.appendEvent(refreshed, 'session_loaded', {
          targetRef: refreshed.targetRef ?? target.id,
          targetKind: refreshed.targetKind ?? target.kind
        })
        return refreshed
      }
    }

    const seed = await this.sessionService.create({
      title: input.title ?? target.label,
      runtimeKind: 'acp_session',
      harnessType: resolveTargetHarnessType(target.kind),
      targetRef: target.id,
      targetKind: target.kind,
      transport: target.transport,
      mode,
      permissionProfile,
      status: 'pending',
      prompt: null,
      timeoutMs,
      environmentId: input.environmentId ?? null,
      parentExecutionId: input.parentExecutionId ?? null,
      xpertId: input.xpertId ?? null,
      threadId: input.threadId ?? null,
      conversationId: input.conversationId ?? null,
      clientSessionId: input.clientSessionId ?? null,
      workingDirectory: input.workingDirectory ?? null,
      lastActivityAt: new Date(),
      metadata: mergeSessionMetadata(null, input.metadata, target, input.workingDirectory)
    })

    await this.auditService.appendEvent(seed, 'session_created', {
      targetRef: target.id,
      targetKind: target.kind,
      mode,
      permissionProfile
    })

    const backend = this.backendRegistry.get(target.kind)
    const handle = await backend.ensureSession({
      session: seed,
      target
    })

    await this.sessionService.update(seed.id, {
      harnessType: handle.harnessType,
      targetRef: handle.targetRef ?? target.id,
      targetKind: target.kind,
      transport: target.transport,
      backendSessionId: handle.backendSessionId ?? null,
      status: 'ready',
      lastActivityAt: new Date(),
      metadata: {
        ...mergeSessionMetadata(seed.metadata, handle.metadata, target, seed.workingDirectory),
        backendSessionId: handle.backendSessionId ?? null
      }
    })

    const refreshed = await this.getSession(seed.id)
    await this.auditService.appendEvent(refreshed, 'session_ready', {
      targetRef: refreshed.targetRef ?? target.id,
      targetKind: refreshed.targetKind ?? target.kind,
      backendSessionId: refreshed.backendSessionId ?? null
    })

    return refreshed
  }

  async ensureDelegatedSession(input: CreateAcpSubExecutionInput): Promise<{
    session: AcpSession
  }> {
    const parentExecution = await this.executionService.findOne(input.parentExecutionId)
    const businessPrincipal = requireCurrentBusinessPrincipal()
    const session = await this.ensureSession({
        title: input.title,
        targetRef: input.targetRef ?? null,
        harnessType: input.harnessType ?? null,
        mode: input.mode ?? (input.reuseSession ? 'persistent' : 'oneshot'),
        permissionProfile: input.permissionProfile,
        timeoutMs: input.timeoutMs,
        environmentId: input.environmentId ?? null,
        parentExecutionId: input.parentExecutionId,
        xpertId: input.xpertId ?? parentExecution?.xpertId ?? null,
        threadId: input.threadId ?? parentExecution?.threadId ?? null,
        conversationId: input.conversationId ?? null,
        workingDirectory: input.workingDirectory,
        reuseSession: input.reuseSession ?? false,
	        metadata: {
	          businessPrincipal,
	          tenantId: businessPrincipal.tenantId,
	          organizationId: businessPrincipal.organizationId,
	          userId: businessPrincipal.userId,
	          ownerUserId: businessPrincipal.userId,
	          effectiveUserId: businessPrincipal.userId,
          sandboxEnvironmentId: input.sandboxEnvironmentId ?? null,
          sandboxProvider: input.sandboxProvider ?? null,
          sandboxWorkForType: input.sandboxWorkForType,
          sandboxWorkForId: input.sandboxWorkForId,
          targetPaths: input.targetPaths ?? null,
          ...(input.codeContext ?? {})
        }
      })

    return { session }
  }

  async createSubExecution(input: CreateAcpSubExecutionInput): Promise<CreateAcpSubExecutionResult> {
    const parentExecution = await this.executionService.findOne(input.parentExecutionId)
    const { session } = await this.ensureDelegatedSession(input)

    const execution = await this.createTurnExecution(
      session,
      input.prompt,
      input.title,
      input.parentExecutionId,
      input.xpertId ?? parentExecution?.xpertId ?? null,
      input.threadId ?? parentExecution?.threadId ?? null
    )

    await this.sessionService.update(session.id, {
      prompt: input.prompt,
      status: 'queued',
      executionId: execution.id,
      activeExecutionId: execution.id,
      lastExecutionId: execution.id,
      lastActivityAt: new Date()
    })
    const refreshed = await this.getSession(session.id)
    const turnIndex = resolveNextTurnIndex(refreshed)
    await this.auditService.appendEvent(refreshed, 'turn_created', {
      executionId: execution.id,
      turnIndex
    })
    const queuedAuditEvent = await this.auditService.appendEvent(refreshed, 'session_queued', {
      executionId: execution.id,
      targetRef: refreshed.targetRef ?? null,
      targetKind: refreshed.targetKind ?? null
    })
    await this.observationService.emitQueuedObservation(refreshed, execution.id, queuedAuditEvent.sequence)
    await this.systemEventProjector.emitQueuedSystemEvent(refreshed, execution.id, queuedAuditEvent.sequence)
    try {
      await this.enqueueQueuedTurn(refreshed, execution.id, refreshed.timeoutMs ?? DEFAULT_ACP_TIMEOUT_MS)
    } catch (error) {
      await this.failSessionLifecycle(refreshed.id, execution.id, error, {
        headline: 'Failed to enqueue ACP execution locally'
      })
      throw error
    }

    return {
      executionId: execution.id,
      acpSessionId: refreshed.id,
      status: refreshed.status,
      message: `ACP session queued for ${refreshed.targetKind ?? refreshed.harnessType}`
    }
  }

  async runTurnBuffered(input: RunAcpTurnInput): Promise<RunAcpTurnResult> {
    const events: AcpRuntimeEvent[] = []
    const prepared = await this.runWithPromptQueue(
      input.sessionId,
      async () => {
        const nextPrepared = await this.prepareTurn(input)
        for await (const event of this.executePreparedTurn(nextPrepared, {
          deliveryMode: input.deliveryMode ?? 'legacy_observer',
          onTurnPrepared: input.onTurnPrepared
        })) {
          events.push(event)
        }
        return nextPrepared
      },
      (position) => {
        events.push({
          type: 'status',
          text: 'queue:queued',
          phase: 'queued',
          headline: 'ACP turn queued',
          isMilestone: true,
          details: { position }
        })
      }
    )

    const session = await this.getSession(prepared.session.id)
    const execution = await this.executionService.findOne(prepared.executionId)
    const status =
      execution?.status === XpertAgentExecutionStatusEnum.SUCCESS
        ? 'success'
        : execution?.status === XpertAgentExecutionStatusEnum.INTERRUPTED
          ? 'canceled'
          : 'error'

    return {
      sessionId: session.id,
      executionId: prepared.executionId,
      requestId: prepared.requestId,
      turnIndex: prepared.turnIndex,
      status,
      output: readExecutionOutput(execution?.outputs),
      summary: session.summary ?? null,
      error: session.error ?? null,
      events
    }
  }

  async *runTurnStream(input: RunAcpTurnInput): AsyncIterable<AcpRuntimeEvent> {
    const queueSlot = this.acquirePromptSlot(input.sessionId)
    if (queueSlot.position > 0) {
      await this.updateQueuedSessionState(input.sessionId, queueSlot.position, 'Waiting for the current ACP turn to finish.')
      yield {
        type: 'status',
        text: 'queue:queued',
        phase: 'queued',
        headline: 'ACP turn queued',
        isMilestone: true,
        details: { position: queueSlot.position }
      }
    }

    await queueSlot.wait()
    await this.updateQueuedSessionState(input.sessionId, null, null)

    try {
      const prepared = await this.prepareTurn(input)
      yield* this.executePreparedTurn(prepared, {
        deliveryMode: input.deliveryMode ?? 'legacy_observer',
        onTurnPrepared: input.onTurnPrepared
      })
    } finally {
      queueSlot.release()
      const remainingQueued = this.getRemainingQueuedCount(input.sessionId)
      await this.updateQueuedSessionState(
        input.sessionId,
        remainingQueued > 0 ? remainingQueued : null,
        remainingQueued > 0 ? 'Waiting for the current ACP turn to finish.' : null
      )
    }
  }

  async runQueuedSession(sessionId: string, signal: AbortSignal): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session.prompt || !session.activeExecutionId) {
      return
    }
    const businessPrincipal = requireBusinessPrincipal(session.metadata?.businessPrincipal, `ACP session ${session.id}`)

    this.#logger.log(
      {
        sessionId: session.id,
        targetRef: session.targetRef ?? null,
        targetKind: session.targetKind ?? null,
        executionId: session.activeExecutionId ?? null,
        xpertId: session.xpertId ?? null,
        conversationId: session.conversationId ?? null,
        threadId: session.threadId ?? null,
        requestedUserId: businessPrincipal.userId,
        effectiveUserId: RequestContext.currentUserId() ?? null
      },
      'Running queued ACP session'
    )

    const queueSlot = this.acquirePromptSlot(session.id)
    if (queueSlot.position > 0) {
      await this.updateQueuedSessionState(session.id, queueSlot.position, 'Waiting for the current ACP turn to finish.')
    }

    await queueSlot.wait()

    try {
      await this.updateQueuedSessionState(session.id, null, null)
      const target = await this.resolveSessionTarget(session)
      const prepared: PreparedTurn = {
        session,
        target,
        backend: this.backendRegistry.get(target.kind),
        executionId: session.activeExecutionId,
        requestId: `acp-turn:${session.activeExecutionId}`,
        turnIndex: resolveNextTurnIndex(session),
        prompt: session.prompt,
        promptMode: 'prompt',
        timeoutMs: normalizeTimeoutMs(session.timeoutMs, target),
        signal
      }

      for await (const _ of this.executePreparedTurn(prepared, {
        deliveryMode: 'legacy_observer'
      })) {
        //
      }

      this.#logger.log(
        {
          sessionId: session.id,
          targetRef: session.targetRef ?? null,
          executionId: session.activeExecutionId ?? null
        },
        'Completed queued ACP session'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.#logger.error(
        {
          err: error,
          sessionId: session.id,
          targetRef: session.targetRef ?? null,
          targetKind: session.targetKind ?? null,
          executionId: session.activeExecutionId ?? null,
          xpertId: session.xpertId ?? null,
          conversationId: session.conversationId ?? null,
          threadId: session.threadId ?? null,
          requestedUserId: businessPrincipal.userId,
          effectiveUserId: RequestContext.currentUserId() ?? null
        },
        'Queued ACP session failed'
      )
      await this.failSessionLifecycle(session.id, session.activeExecutionId, error, {
        headline: 'ACP queued execution failed before Codexpert completed'
      })
      throw error
    } finally {
      queueSlot.release()
      const remainingQueued = this.getRemainingQueuedCount(session.id)
      await this.updateQueuedSessionState(
        session.id,
        remainingQueued > 0 ? remainingQueued : null,
        remainingQueued > 0 ? 'Waiting for the current ACP turn to finish.' : null
      )
    }
  }

  async cancelSession(
    sessionId: string,
    reason = 'Canceled by user',
    options?: { deliveryMode?: 'inline_bridge' | 'legacy_observer' }
  ): Promise<AcpSession> {
    const deliveryMode = options?.deliveryMode ?? 'legacy_observer'
    const session = await this.getSession(sessionId)
    if (!session.activeExecutionId && isTerminalStatus(session.status)) {
      return session
    }

    await this.commandBus.execute(
      new StopHandoffMessageCommand({
        messageIds: [`acp-session:${session.id}`],
        executionIds: session.activeExecutionId ? [session.activeExecutionId] : [],
        reason
      })
    ).catch((error) => {
      this.#logger.warn(`Failed to stop ACP handoff message for ${session.id}: ${error}`)
    })

    if (session.activeExecutionId) {
      await this.executionCancelService.cancelExecutions([session.activeExecutionId], reason)
    }

    const target = await this.resolveSessionTarget(session).catch(() => null)
    if (target) {
      await this.backendRegistry.get(target.kind).cancel({
        handle: this.sessionToHandle(session, target),
        reason
      }).catch((error) => {
        this.#logger.warn(`Failed to cancel backend session ${session.id}: ${error}`)
      })
    }

    const status = session.mode === 'persistent' ? 'ready' : 'canceled'
    await this.sessionService.update(session.id, {
      status,
      error: reason,
      canceledAt: new Date(),
      completedAt: new Date(),
      activeExecutionId: null,
      lastActivityAt: new Date(),
      metadata: {
        ...(session.metadata ?? {}),
        phase: 'canceled',
        lastHeadline: reason,
        lastError: reason,
        queueState: null
      }
    })
    if (deliveryMode === 'legacy_observer') {
      await this.systemEventProjector.flushSession(session, session.activeExecutionId ?? session.executionId ?? '')
      await this.systemEventProjector.emitCanceledSystemEvent(
        session,
        session.activeExecutionId ?? session.executionId ?? null,
        reason
      )
    }
    this.systemEventProjector.clearSession(session.id)
    this.observationService.clearSession(session.id)
    const refreshed = await this.getSession(session.id)

    if (session.activeExecutionId) {
      await this.commandBus.execute(
        new XpertAgentExecutionUpsertCommand({
          id: session.activeExecutionId,
          status: XpertAgentExecutionStatusEnum.INTERRUPTED,
          error: reason,
          metadata: this.executionMapper.toExecutionMetadata(refreshed)
        })
      )
    }

    await this.auditService.appendEvent(refreshed, 'turn_canceled', {
      executionId: session.activeExecutionId ?? null,
      reason
    })
    await this.auditService.appendEvent(refreshed, 'session_canceled', { reason })
    return refreshed
  }

  async closeSession(
    sessionId: string,
    reason = 'Closed by user',
    options?: { deliveryMode?: 'inline_bridge' | 'legacy_observer' }
  ): Promise<AcpSession> {
    void options
    const session = await this.getSession(sessionId)

    await this.commandBus.execute(
      new StopHandoffMessageCommand({
        messageIds: [`acp-session:${session.id}`],
        executionIds: session.activeExecutionId ? [session.activeExecutionId] : [],
        reason
      })
    ).catch(() => {
      //
    })

    const target = await this.resolveSessionTarget(session)
    await this.backendRegistry.get(target.kind).close({
      handle: this.sessionToHandle(session, target),
      reason
    }).catch((error) => {
      this.#logger.warn(`Failed to close backend session ${session.id}: ${error}`)
    })

    await this.sessionService.update(session.id, {
      status: 'closed',
      activeExecutionId: null,
      completedAt: new Date(),
      lastActivityAt: new Date(),
      metadata: {
        ...(session.metadata ?? {}),
        queueState: null
      }
    })
    this.systemEventProjector.clearSession(session.id)
    this.observationService.clearSession(session.id)
    const refreshed = await this.getSession(session.id)
    await this.auditService.appendEvent(refreshed, 'session_closed', { reason })
    return refreshed
  }

  private async prepareTurn(input: RunAcpTurnInput): Promise<PreparedTurn> {
    const session = await this.getSession(input.sessionId)
    const target = await this.resolveSessionTarget(session)
    const execution = await this.createTurnExecution(
      session,
      input.prompt,
      input.title,
      input.parentExecutionId ?? session.parentExecutionId ?? null,
      input.xpertId ?? session.xpertId ?? null,
      input.threadId ?? session.threadId ?? null
    )

    await this.sessionService.update(session.id, {
      prompt: input.prompt,
      executionId: execution.id,
      activeExecutionId: execution.id,
      lastExecutionId: execution.id,
      lastActivityAt: new Date()
    })
    const refreshed = await this.getSession(session.id)
    const turnIndex = resolveNextTurnIndex(refreshed)
    await this.auditService.appendEvent(refreshed, 'turn_created', {
      executionId: execution.id,
      turnIndex
    })

    return {
      session: refreshed,
      target,
      backend: this.backendRegistry.get(target.kind),
      executionId: execution.id,
      requestId: `acp-turn:${execution.id}`,
      turnIndex,
      prompt: input.prompt,
      promptMode: input.promptMode ?? 'prompt',
      timeoutMs: normalizeTimeoutMs(input.timeoutMs ?? refreshed.timeoutMs ?? undefined, target)
    }
  }

  private async *executePreparedTurn(
    prepared: PreparedTurn,
    options?: {
      deliveryMode?: 'inline_bridge' | 'legacy_observer'
      onTurnPrepared?: (turn: {
        sessionId: string
        executionId: string
        requestId: string
        turnIndex: number
        promptMode: 'prompt' | 'steer'
      }) => Promise<void> | void
    }
  ): AsyncIterable<AcpRuntimeEvent> {
    const deliveryMode = options?.deliveryMode ?? 'legacy_observer'
    const controller = new AbortController()
    if (prepared.signal?.aborted) {
      controller.abort()
    } else {
      prepared.signal?.addEventListener('abort', () => controller.abort(), { once: true })
    }
    this.executionCancelService.register(prepared.executionId, controller)

    let ensuredHandle
    try {
      ensuredHandle = await prepared.backend.ensureSession({
        session: prepared.session,
        target: prepared.target
      })
    } catch (error) {
      await this.failSessionLifecycle(prepared.session.id, prepared.executionId, error, {
        headline: 'Failed before Codexpert session became ready'
      })
      throw error
    }

    await this.sessionService.update(prepared.session.id, {
      backendSessionId: ensuredHandle.backendSessionId ?? prepared.session.backendSessionId ?? null,
      metadata: {
        ...(prepared.session.metadata ?? {}),
        ...(ensuredHandle.metadata ?? {}),
        backendSessionId: ensuredHandle.backendSessionId ?? prepared.session.backendSessionId ?? null,
        lastUpstreamHandoff: buildUpstreamHandoff(prepared.target.kind, ensuredHandle, prepared.executionId)
      }
    })
    const session = await this.getSession(prepared.session.id)
    const runningSession = await this.projector.beginTurn(
      session,
      prepared.executionId,
      prepared.requestId,
      prepared.turnIndex,
      prepared.prompt
    )
    await options?.onTurnPrepared?.({
      sessionId: runningSession.id,
      executionId: prepared.executionId,
      requestId: prepared.requestId,
      turnIndex: prepared.turnIndex,
      promptMode: prepared.promptMode
    })

    const state = this.projector.createState()
    let terminal:
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
      | null = null

    try {
      for await (const event of prepared.backend.runTurn({
        session: runningSession,
        target: prepared.target,
        handle: ensuredHandle,
        executionId: prepared.executionId,
        requestId: prepared.requestId,
        turnIndex: prepared.turnIndex,
        prompt: prepared.prompt,
        promptMode: prepared.promptMode,
        permissionProfile: runningSession.permissionProfile,
        timeoutMs: prepared.timeoutMs,
        signal: controller.signal
      })) {
        const auditEvent = await this.projector.projectEvent(runningSession, prepared.executionId, event, state)
        if (deliveryMode === 'legacy_observer') {
          await this.systemEventProjector.handleRawEvent(runningSession, prepared.executionId, auditEvent, event)
          await this.observationService.handleRawEvent(runningSession, prepared.executionId, auditEvent, event)
        }

        if (event.type === 'done') {
          terminal = {
            kind: event.stopReason === 'cancelled' ? 'canceled' : 'success',
            summary: event.summary ?? null,
            output: event.output ?? null,
            ...(event.details ? { details: event.details } : {})
          } as typeof terminal
        } else if (event.type === 'error') {
          terminal =
            event.code === 'canceled'
              ? {
                  kind: 'canceled',
                  message: event.message
                }
              : {
                  kind: 'error',
                  message: event.message,
                  code: event.code,
                  details: event.details
                }
        }

        yield event
      }
    } catch (error) {
      terminal = controller.signal.aborted
        ? {
            kind: 'canceled',
            message: 'Canceled by user'
          }
        : {
            kind: 'error',
            message: error instanceof Error ? error.message : String(error)
          }

      const failureEvent: AcpRuntimeEvent = {
        type: terminal.kind === 'canceled' ? 'error' : 'error',
        message: terminal.message,
        code: terminal.kind === 'canceled' ? 'canceled' : undefined,
        phase: terminal.kind === 'canceled' ? 'canceled' : 'failed',
        headline: terminal.kind === 'canceled' ? 'Codexpert execution canceled' : 'Codexpert execution failed',
        isMilestone: true,
        final: true
      }

      const auditEvent = await this.projector.projectEvent(runningSession, prepared.executionId, failureEvent, state)
      if (deliveryMode === 'legacy_observer') {
        await this.systemEventProjector.handleRawEvent(runningSession, prepared.executionId, auditEvent, failureEvent)
        await this.observationService.handleRawEvent(runningSession, prepared.executionId, auditEvent, failureEvent)
      }

      yield failureEvent
    } finally {
      if (deliveryMode === 'legacy_observer') {
        await this.systemEventProjector.flushSession(runningSession, prepared.executionId)
      }
      this.systemEventProjector.clearSession(runningSession.id)
      if (deliveryMode === 'legacy_observer') {
        await this.observationService.flushSession(runningSession, prepared.executionId)
      }
      this.observationService.clearSession(runningSession.id)
      this.executionCancelService.unregister(prepared.executionId)
    }

    await this.projector.finishTurn({
      session: runningSession,
      executionId: prepared.executionId,
      requestId: prepared.requestId,
      turnIndex: prepared.turnIndex,
      state,
      outcome:
        terminal ??
        (controller.signal.aborted
          ? {
              kind: 'canceled',
              message: 'Canceled by user'
            }
          : {
              kind: 'error',
              message: 'Codexpert ACP stream ended before a terminal event'
            })
    })
  }

  private async createTurnExecution(
    session: AcpSession,
    prompt: string,
    title?: string,
    parentExecutionId?: string | null,
    xpertId?: string | null,
    threadId?: string | null
  ) {
    return await this.commandBus.execute(
      new XpertAgentExecutionUpsertCommand({
        title: title ?? session.title ?? shortPrompt(prompt),
        category: 'agent',
        type: 'acp_session',
        parentId: parentExecutionId ?? undefined,
        xpertId: xpertId ?? undefined,
        threadId: threadId ?? session.threadId ?? undefined,
        status: XpertAgentExecutionStatusEnum.PENDING,
        metadata: this.executionMapper.toExecutionMetadata(session, undefined, {
          acpTurnIndex: resolveNextTurnIndex(session),
          sessionStatus: session.status
        })
      })
    )
  }

  private async enqueueQueuedTurn(session: AcpSession, executionId: string, timeoutMs: number) {
    const businessPrincipal = requireBusinessPrincipal(session.metadata?.businessPrincipal, `ACP session ${session.id}`)
    await this.handoffQueue.enqueue({
      id: `acp-session:${session.id}`,
      type: ACP_TASK_MESSAGE_TYPE,
      version: 1,
      tenantId: session.tenantId,
      sessionKey: session.id,
      businessKey: session.id,
      attempt: 1,
      maxAttempts: 1,
      enqueuedAt: Date.now(),
      traceId: executionId,
      payload: {
        sessionId: session.id,
        executionId
      },
      headers: {
        organizationId: businessPrincipal.organizationId,
        userId: businessPrincipal.userId,
        ...(RequestContext.getLanguageCode() ? { language: RequestContext.getLanguageCode() } : {}),
        ...(session.conversationId ? { conversationId: session.conversationId } : {}),
        source: 'xpert',
        requestedLane: 'subagent',
        policyTimeoutMs: String(timeoutMs)
      }
    })
  }

  private async runWithPromptQueue<T>(
    sessionId: string,
    work: () => Promise<T>,
    onQueued?: (position: number) => void
  ): Promise<T> {
    const queueSlot = this.acquirePromptSlot(sessionId)
    if (queueSlot.position > 0) {
      await this.updateQueuedSessionState(sessionId, queueSlot.position, 'Waiting for the current ACP turn to finish.')
      onQueued?.(queueSlot.position)
    }

    await queueSlot.wait()
    await this.updateQueuedSessionState(sessionId, null, null)

    try {
      return await work()
    } finally {
      queueSlot.release()
      const remainingQueued = this.getRemainingQueuedCount(sessionId)
      await this.updateQueuedSessionState(
        sessionId,
        remainingQueued > 0 ? remainingQueued : null,
        remainingQueued > 0 ? 'Waiting for the current ACP turn to finish.' : null
      )
    }
  }

  private acquirePromptSlot(sessionId: string): {
    position: number
    wait: () => Promise<void>
    release: () => void
  } {
    const previous = this.#promptQueueTails.get(sessionId) ?? Promise.resolve()
    const nextDepth = (this.#promptQueueDepth.get(sessionId) ?? 0) + 1
    this.#promptQueueDepth.set(sessionId, nextDepth)

    let resolveCurrent!: () => void
    const current = new Promise<void>((resolve) => {
      resolveCurrent = resolve
    })
    const tail = previous.catch(() => undefined).then(() => current)
    this.#promptQueueTails.set(sessionId, tail)

    return {
      position: nextDepth - 1,
      wait: async () => {
        await previous.catch(() => undefined)
      },
      release: () => {
        resolveCurrent()
        const remaining = (this.#promptQueueDepth.get(sessionId) ?? 1) - 1
        if (remaining <= 0) {
          this.#promptQueueDepth.delete(sessionId)
        } else {
          this.#promptQueueDepth.set(sessionId, remaining)
        }
        if (this.#promptQueueTails.get(sessionId) === tail) {
          this.#promptQueueTails.delete(sessionId)
        }
      }
    }
  }

  private getRemainingQueuedCount(sessionId: string): number {
    const depth = this.#promptQueueDepth.get(sessionId) ?? 0
    return depth > 1 ? depth - 1 : 0
  }

  private async updateQueuedSessionState(sessionId: string, position: number | null, note: string | null) {
    const session = await this.sessionService.findOne(sessionId)
    if (!session) {
      return
    }

    await this.sessionService.update(sessionId, {
      lastActivityAt: new Date(),
      metadata: {
        ...(session.metadata ?? {}),
        phase: position && position > 0 ? 'queued' : session.metadata?.phase ?? deriveAcpPhase(session.status),
        lastHeadline: position && position > 0 ? 'ACP turn queued' : session.metadata?.lastHeadline ?? null,
        queueState:
          position && position > 0
            ? {
                status: 'queued',
                position,
                queuedAt: new Date().toISOString(),
                note
              }
            : null
      }
    })
  }

  private async toSessionStatus(session: AcpSession) {
    const current = await this.getSession(session.id)
    const metadata = current.metadata ?? {}
    return {
      ...current,
      phase: (metadata.phase as TAcpRuntimePhase | undefined) ?? deriveAcpPhase(current.status),
      queueState: metadata.queueState ?? null,
      lastHeadline: readString(metadata.lastHeadline) ?? null,
      lastObservationAt: readString(metadata.lastObservationAt) ?? null,
      lastObservationSequence:
        typeof metadata.lastObservationSequence === 'number' ? metadata.lastObservationSequence : null,
      lastConsumedObservationSequence:
        typeof metadata.lastConsumedObservationSequence === 'number' ? metadata.lastConsumedObservationSequence : null,
      lastReportedObservationSequence:
        typeof metadata.lastReportedObservationSequence === 'number' ? metadata.lastReportedObservationSequence : null,
      lastProjectedSequence: typeof metadata.lastProjectedSequence === 'number' ? metadata.lastProjectedSequence : null,
      lastProjectedTextSequence:
        typeof metadata.lastProjectedTextSequence === 'number' ? metadata.lastProjectedTextSequence : null,
      lastProjectedHeadline: readString(metadata.lastProjectedHeadline) ?? null,
      sourceConversationId: readString(metadata.sourceConversationId) ?? null,
      resumeThreadId: readString(metadata.resumeThreadId) ?? null,
      effectiveUserId: readString(metadata.effectiveUserId) ?? readString(metadata.userId) ?? null,
      repo: {
        repoConnectionId: readString(metadata.repoConnectionId) ?? null,
        repoId: readString(metadata.repoId) ?? null,
        repoName: readString(metadata.repoName) ?? null,
        repoOwner: readString(metadata.repoOwner) ?? null,
        repoSlug: readString(metadata.repoSlug) ?? null,
        branchName: readString(metadata.branchName) ?? null,
        workspacePath: readString(metadata.workspacePath) ?? current.workingDirectory ?? null,
        environmentId: current.environmentId ?? null
      },
      codingAssistant: {
        name: readString(metadata.codingAgentName) ?? null,
        providerDisplayName: readString(metadata.providerDisplayName) ?? null
      },
      lastUpstreamHandoff: readString(metadata.lastUpstreamHandoff) ?? null,
      lastError: readString(metadata.lastError) ?? current.error ?? null
    }
  }

  private async failSessionLifecycle(
    sessionId: string,
    executionId: string | null | undefined,
    error: unknown,
    options?: {
      headline?: string
      requiresAttention?: boolean
    }
  ) {
    const message = error instanceof Error ? error.message : String(error)
    const headline = options?.headline ?? 'ACP execution failed'
    const current = await this.sessionService.findOne(sessionId)
    if (!current) {
      return null
    }

    const alreadyFailed =
      current.status === 'error' &&
      current.error === message &&
      current.metadata?.phase === 'failed' &&
      current.metadata?.lastHeadline === headline

    if (!alreadyFailed) {
      await this.sessionService.update(sessionId, {
        status: 'error',
        error: message,
        activeExecutionId: null,
        completedAt: new Date(),
        lastActivityAt: new Date(),
        metadata: {
          ...(current.metadata ?? {}),
          phase: 'failed',
          lastHeadline: headline,
          lastError: message,
          queueState: null
        }
      })
    }

    const refreshed = await this.getSession(sessionId)
    if (executionId) {
      await this.commandBus.execute(
        new XpertAgentExecutionUpsertCommand({
          id: executionId,
          status: XpertAgentExecutionStatusEnum.ERROR,
          error: message,
          metadata: this.executionMapper.toExecutionMetadata(refreshed, undefined, {
            phase: 'failed',
            sessionStatus: refreshed.status
          })
        })
      )
    }

    if (!alreadyFailed) {
      await this.auditService.appendEvent(refreshed, 'turn_failed', {
        executionId: executionId ?? null,
        error: message,
        headline
      })
      await this.auditService.appendEvent(refreshed, 'session_failed', {
        executionId: executionId ?? null,
        error: message,
        headline
      })
      await this.systemEventProjector.emitFailureSystemEvent(refreshed, executionId ?? refreshed.executionId ?? '', message, {
        headline,
        phase: 'failed',
        requiresAttention: options?.requiresAttention ?? false
      })
      await this.observationService.emitFailureObservation(refreshed, executionId ?? refreshed.executionId ?? '', message, {
        headline,
        requiresAttention: options?.requiresAttention ?? false
      })
    }

    return refreshed
  }

  private async resolveTarget(input: EnsureAcpSessionInput): Promise<ResolvedAcpTarget> {
    const ref = input.targetRef ?? mapHarnessToTargetRef(input.harnessType ?? null) ?? 'remote_xpert_acp'
    const target = await this.targetRegistry.resolve(ref)
    if (!target) {
      throw new Error(`ACP target ${ref ?? input.harnessType ?? 'unknown'} not found`)
    }
    if (!target.enabled) {
      throw new Error(`ACP target ${target.id} is disabled`)
    }
    return target
  }

  private async resolveSessionTarget(session: AcpSession): Promise<ResolvedAcpTarget> {
    const ref = session.targetRef ?? mapHarnessToTargetRef(session.harnessType)
    const target = await this.targetRegistry.resolve(ref)
    if (!target) {
      throw new Error(`ACP target ${ref ?? session.harnessType} not found`)
    }
    return target
  }

  private sessionToHandle(session: AcpSession, target: ResolvedAcpTarget) {
    return {
      kind: target.kind,
      harnessType: session.harnessType,
      targetRef: session.targetRef ?? target.id,
      backendSessionId: session.backendSessionId ?? null,
      cwd: session.workingDirectory ?? null,
      metadata: {
        ...(session.metadata ?? {}),
        target
      }
    }
  }
}

function mergeSessionMetadata(
  current: IAcpSession['metadata'] | null | undefined,
  next: Record<string, unknown> | null | undefined,
  target: Pick<ResolvedAcpTarget, 'id' | 'kind' | 'label' | 'transport'>,
  workingDirectory?: string | null
) {
  const merged = {
    ...(current ?? {}),
    ...(next ?? {}),
    targetRef: target.id,
    targetKind: target.kind,
    transport: target.transport,
    providerDisplayName:
      readString(next?.providerDisplayName) ??
      readString(current?.providerDisplayName) ??
      target.label,
    codingAgentName:
      readString(next?.codingAgentName) ??
      readString(current?.codingAgentName) ??
      readString(next?.providerDisplayName) ??
      readString(current?.providerDisplayName) ??
      target.label,
    workspacePath:
      readString(next?.workspacePath) ??
      readString(current?.workspacePath) ??
      readString(workingDirectory)
  }

  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined))
}

function dedupeTargetRefs(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const refs: string[] = []

  for (const value of values) {
    const targetRef = readString(value)
    if (!targetRef || seen.has(targetRef)) {
      continue
    }

    seen.add(targetRef)
    refs.push(targetRef)
  }

  return refs
}

function normalizeTimeoutMs(value: number | undefined | null, target: ResolvedAcpTarget): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }

  return normalizeTargetTimeoutMs(target, DEFAULT_ACP_TIMEOUT_MS)
}

function resolveNextTurnIndex(session: Pick<IAcpSession, 'metadata'>): number {
  const current = session.metadata?.turnIndex
  return typeof current === 'number' && Number.isFinite(current) ? current + 1 : 1
}

function shortPrompt(value: string): string {
  const trimmed = value.trim()
  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`
}

function mapHarnessToTargetRef(harnessType: THarnessType | null | undefined): string | null {
  return harnessType === 'remote_xpert_acp' ? 'remote_xpert_acp' : null
}

function readExecutionOutput(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const output = Reflect.get(value, 'output')
  return typeof output === 'string' && output.length > 0 ? output : null
}

function buildUpstreamHandoff(
  targetKind: ResolvedAcpTarget['kind'],
  handle: { backendSessionId?: string | null },
  executionId: string
): string {
  return `${targetKind}:${handle.backendSessionId ?? executionId}`
}

function isTerminalStatus(status: IAcpSession['status']): boolean {
  return status === 'success' || status === 'error' || status === 'timeout' || status === 'canceled' || status === 'closed'
}

function deriveAcpPhase(status: IAcpSession['status']): TAcpRuntimePhase {
  switch (status) {
    case 'queued':
    case 'pending':
      return 'queued'
    case 'ready':
    case 'running':
      return 'running'
    case 'success':
    case 'closed':
      return 'completed'
    case 'canceled':
      return 'canceled'
    case 'error':
    case 'timeout':
    default:
      return 'failed'
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
