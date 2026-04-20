import {
  IAcpSession,
  IEnvironment,
  XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { resolveSandboxBackend } from '@xpert-ai/plugin-sdk'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { ExecutionCancelService } from '../shared'
import { EnvironmentService } from '../environment'
import { SandboxAcquireBackendCommand } from '../sandbox/commands'
import { StopHandoffMessageCommand } from '../handoff/commands'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution/commands'
import { XpertAgentExecutionService } from '../xpert-agent-execution/agent-execution.service'
import { AcpArtifactService } from './acp-artifact.service'
import { AcpAuditService } from './acp-audit.service'
import { AcpExecutionMapper } from './acp-execution.mapper'
import { AcpSession } from './acp-session.entity'
import { AcpSessionService } from './acp-session.service'
import { AcpHarnessRegistry } from './harness/acp-harness.registry'
import { CreateAcpSubExecutionInput, CreateAcpSubExecutionResult } from './commands/create-acp-sub-execution.command'
import { ACP_TASK_MESSAGE_TYPE } from './handoff.contract'

const DEFAULT_ACP_TIMEOUT_MS = 15 * 60 * 1000

@Injectable()
export class AcpRuntimeService {
  readonly #logger = new Logger(AcpRuntimeService.name)

  constructor(
    private readonly sessionService: AcpSessionService,
    private readonly environmentService: EnvironmentService,
    private readonly executionService: XpertAgentExecutionService,
    private readonly auditService: AcpAuditService,
    private readonly artifactService: AcpArtifactService,
    private readonly commandBus: CommandBus,
    private readonly handoffQueue: HandoffQueueService,
    private readonly executionMapper: AcpExecutionMapper,
    private readonly harnessRegistry: AcpHarnessRegistry,
    private readonly executionCancelService: ExecutionCancelService
  ) {}

  async createSubExecution(input: CreateAcpSubExecutionInput): Promise<CreateAcpSubExecutionResult> {
    const permissionProfile = input.permissionProfile ?? 'workspace_write'
    const timeoutMs = normalizeTimeoutMs(input.timeoutMs)
    const parentExecution = await this.executionService.findOne(input.parentExecutionId)

    const execution = await this.commandBus.execute(
      new XpertAgentExecutionUpsertCommand({
        title: input.title,
        category: 'agent',
        type: 'acp_session',
        parentId: input.parentExecutionId,
        xpertId: input.xpertId ?? parentExecution?.xpertId ?? null,
        threadId: input.threadId ?? parentExecution?.threadId ?? null,
        status: XpertAgentExecutionStatusEnum.PENDING,
        metadata: {
          provider: 'acp',
          model: input.harnessType,
          runtimeKind: 'acp_session',
          harnessType: input.harnessType,
          permissionProfile
        }
      })
    )

    const session = await this.sessionService.create({
      title: input.title,
      runtimeKind: 'acp_session',
      harnessType: input.harnessType,
      mode: 'oneshot',
      permissionProfile,
      status: 'pending',
      prompt: input.prompt,
      timeoutMs,
      environmentId: input.environmentId ?? null,
      executionId: execution.id,
      parentExecutionId: input.parentExecutionId,
      xpertId: input.xpertId ?? parentExecution?.xpertId ?? null,
      threadId: input.threadId ?? parentExecution?.threadId ?? null,
      conversationId: input.conversationId ?? null,
      workingDirectory: input.workingDirectory,
      metadata: {
        sandboxEnvironmentId: input.sandboxEnvironmentId ?? null,
        sandboxProvider: input.sandboxProvider ?? null,
        sandboxWorkForType: input.sandboxWorkForType,
        sandboxWorkForId: input.sandboxWorkForId,
        targetPaths: input.targetPaths ?? null
      }
    })

    await this.updateExecutionSummary(session)
    await this.auditService.appendEvent(session, 'session_created', {
      harnessType: session.harnessType,
      permissionProfile: session.permissionProfile,
      environmentId: session.environmentId ?? null
    })

    const preparation = await this.prepareSession(session)
    if (!preparation.ok) {
      const failedSession = await this.markFailed(session, preparation.reason, 'config_error')
      return {
        executionId: execution.id,
        acpSessionId: failedSession.id,
        status: failedSession.status,
        message: preparation.reason
      }
    }

    await this.sessionService.update(session.id, {
      status: 'queued',
      metadata: {
        ...(session.metadata ?? {}),
        commandPreview: preparation.commandPreview
      }
    })

    const refreshed = await this.getSession(session.id)
    await this.updateExecutionSummary(refreshed)
    await this.auditService.appendEvent(refreshed, 'session_queued', {
      commandPreview: preparation.commandPreview,
      environment: preparation.redactedEnvironment
    })

    try {
      await this.handoffQueue.enqueue({
        id: `acp-session:${refreshed.id}`,
        type: ACP_TASK_MESSAGE_TYPE,
        version: 1,
        tenantId: refreshed.tenantId,
        sessionKey: refreshed.id,
        businessKey: refreshed.id,
        attempt: 1,
        maxAttempts: 1,
        enqueuedAt: Date.now(),
        traceId: refreshed.executionId ?? refreshed.id,
        payload: {
          sessionId: refreshed.id,
          executionId: refreshed.executionId
        },
        headers: {
          ...(refreshed.organizationId ? { organizationId: refreshed.organizationId } : {}),
          ...(RequestContext.currentUserId() ? { userId: RequestContext.currentUserId() } : {}),
          ...(RequestContext.getLanguageCode() ? { language: RequestContext.getLanguageCode() } : {}),
          ...(refreshed.conversationId ? { conversationId: refreshed.conversationId } : {}),
          source: 'xpert',
          requestedLane: 'subagent',
          policyTimeoutMs: String(timeoutMs)
        }
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const failed = await this.markFailed(refreshed, reason, 'session_failed')
      return {
        executionId: execution.id,
        acpSessionId: failed.id,
        status: failed.status,
        message: reason
      }
    }

    return {
      executionId: execution.id,
      acpSessionId: refreshed.id,
      status: refreshed.status,
      message: `ACP session queued for ${refreshed.harnessType}`
    }
  }

  async getSession(sessionId: string): Promise<AcpSession> {
    const session = await this.sessionService.findOne(sessionId)
    if (!session) {
      throw new NotFoundException(`ACP session ${sessionId} not found`)
    }
    return session
  }

  async cancelSession(sessionId: string, reason = 'Canceled by user'): Promise<AcpSession> {
    const session = await this.getSession(sessionId)
    if (isTerminalStatus(session.status)) {
      return session
    }

    await this.commandBus.execute(
      new StopHandoffMessageCommand({
        messageIds: [`acp-session:${session.id}`],
        executionIds: session.executionId ? [session.executionId] : [],
        reason
      })
    ).catch((error) => {
      this.#logger.warn(`Failed to stop ACP handoff message for ${session.id}: ${error}`)
    })

    if (session.executionId) {
      await this.executionCancelService.cancelExecutions([session.executionId], reason)
    }

    await this.sessionService.update(session.id, {
      status: 'canceled',
      error: reason,
      canceledAt: new Date(),
      completedAt: new Date()
    })
    const refreshed = await this.getSession(session.id)
    await this.updateExecutionSummary(refreshed)
    await this.auditService.appendEvent(refreshed, 'session_canceled', { reason })
    return refreshed
  }

  async runQueuedSession(sessionId: string, signal: AbortSignal): Promise<void> {
    const session = await this.getSession(sessionId)
    if (isTerminalStatus(session.status)) {
      return
    }

    const controller = new AbortController()
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    if (session.executionId) {
      this.executionCancelService.register(session.executionId, controller)
    }

    try {
      const environment = await this.resolveEnvironment(session)
      const adapter = this.harnessRegistry.get(session.harnessType)
      const configuration = adapter.resolveConfiguration(environment.variables)
      const commandPreview = adapter.buildCommandPreview(configuration, {
        workingDirectory: session.workingDirectory ?? process.cwd(),
        prompt: session.prompt,
        permissionProfile: session.permissionProfile,
        targetPaths: session.metadata?.targetPaths ?? undefined,
        timeoutMs: session.timeoutMs ?? DEFAULT_ACP_TIMEOUT_MS
      })

      await this.sessionService.update(session.id, {
        status: 'running',
        startedAt: new Date(),
        metadata: {
          ...(session.metadata ?? {}),
          commandPreview
        }
      })

      const runningSession = await this.getSession(session.id)
      await this.updateExecutionSummary(runningSession)
      await this.auditService.appendEvent(runningSession, 'session_started', {
        commandPreview,
        environment: configuration.redactedEnvironment
      })

      const sandbox = await this.commandBus.execute(
        new SandboxAcquireBackendCommand({
          provider: runningSession.metadata?.sandboxProvider ?? undefined,
          workingDirectory: runningSession.workingDirectory ?? undefined,
          environmentId: runningSession.metadata?.sandboxEnvironmentId ?? undefined,
          workFor: {
            type: runningSession.metadata?.sandboxWorkForType ?? 'user',
            id: runningSession.metadata?.sandboxWorkForId ?? runningSession.executionId ?? runningSession.id
          },
          tenantId: runningSession.tenantId,
          organizationId: runningSession.organizationId ?? undefined
        })
      )

      const backend = resolveSandboxBackend(sandbox)
      if (!backend) {
        throw new Error('Sandbox backend is unavailable for ACP session execution')
      }

      const result = await adapter.execute({
        backend,
        workingDirectory: runningSession.workingDirectory ?? process.cwd(),
        prompt: runningSession.prompt,
        permissionProfile: runningSession.permissionProfile,
        targetPaths: runningSession.metadata?.targetPaths ?? undefined,
        timeoutMs: runningSession.timeoutMs ?? DEFAULT_ACP_TIMEOUT_MS,
        variables: environment.variables,
        signal: controller.signal,
        onOutput: async (line) => {
          await this.auditService.appendEvent(runningSession, 'terminal_output', {
            line
          })
        }
      })

      const latest = await this.getSession(session.id)
      await this.artifactService.createArtifact(latest, {
        kind: 'stdout',
        title: 'CLI output',
        mimeType: 'text/plain',
        content: result.output,
        metadata: {
          exitCode: result.exitCode,
          timedOut: result.timedOut
        }
      })
      await this.artifactService.createArtifact(latest, {
        kind: 'summary',
        title: 'Execution summary',
        mimeType: 'text/plain',
        content: result.summary,
        metadata: {
          commandPreview: result.commandPreview
        }
      })

      if (result.status === 'success') {
        await this.sessionService.update(session.id, {
          status: 'success',
          summary: result.summary,
          error: null,
          lastExitCode: result.exitCode,
          completedAt: new Date(),
          metadata: {
            ...(latest.metadata ?? {}),
            commandPreview: result.commandPreview
          }
        })
        const completed = await this.getSession(session.id)
        await this.updateExecutionSummary(completed, {
          output: result.summary
        })
        await this.auditService.appendEvent(completed, 'session_completed', {
          exitCode: result.exitCode,
          summary: result.summary
        })
        return
      }

      if (result.status === 'timeout') {
        await this.markTimedOut(latest, result.summary, result.exitCode)
        return
      }

      if (result.status === 'canceled') {
        await this.cancelSession(latest.id, 'Canceled by user')
        return
      }

      await this.markFailed(latest, result.summary, 'session_failed', result.exitCode)
    } catch (error) {
      const latest = await this.getSession(session.id).catch(() => session)
      if (controller.signal.aborted || signal.aborted) {
        await this.cancelSession(latest.id, 'Canceled by user')
        return
      }

      const reason = error instanceof Error ? error.message : String(error)
      await this.markFailed(latest, reason, 'session_failed')
    } finally {
      if (session.executionId) {
        this.executionCancelService.unregister(session.executionId)
      }
    }
  }

  private async prepareSession(session: AcpSession): Promise<{ ok: true; commandPreview: string; redactedEnvironment: Record<string, string> } | { ok: false; reason: string }> {
    try {
      const environment = await this.resolveEnvironment(session)
      const adapter = this.harnessRegistry.get(session.harnessType)
      const configuration = adapter.resolveConfiguration(environment.variables)
      const commandPreview = adapter.buildCommandPreview(configuration, {
        workingDirectory: session.workingDirectory ?? process.cwd(),
        prompt: session.prompt,
        permissionProfile: session.permissionProfile,
        targetPaths: session.metadata?.targetPaths ?? undefined,
        timeoutMs: session.timeoutMs ?? DEFAULT_ACP_TIMEOUT_MS
      })
      return {
        ok: true,
        commandPreview,
        redactedEnvironment: configuration.redactedEnvironment
      }
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private async resolveEnvironment(session: Pick<IAcpSession, 'environmentId'>): Promise<IEnvironment> {
    if (!session.environmentId) {
      throw new Error('ACP session requires an environmentId to resolve CLI configuration')
    }

    const environment = await this.environmentService.findOne(session.environmentId)
    if (!environment) {
      throw new Error(`Environment ${session.environmentId} not found`)
    }

    return environment
  }

  private async markFailed(
    session: AcpSession,
    reason: string,
    eventType: 'config_error' | 'session_failed',
    exitCode?: number | null
  ): Promise<AcpSession> {
    await this.sessionService.update(session.id, {
      status: 'error',
      error: reason,
      lastExitCode: exitCode ?? null,
      completedAt: new Date()
    })
    const refreshed = await this.getSession(session.id)
    await this.updateExecutionSummary(refreshed)
    await this.auditService.appendEvent(refreshed, eventType, {
      reason,
      exitCode: exitCode ?? null
    })
    return refreshed
  }

  private async markTimedOut(session: AcpSession, summary: string, exitCode?: number | null) {
    await this.sessionService.update(session.id, {
      status: 'timeout',
      error: summary,
      lastExitCode: exitCode ?? null,
      completedAt: new Date()
    })
    const refreshed = await this.getSession(session.id)
    await this.updateExecutionSummary(refreshed)
    await this.auditService.appendEvent(refreshed, 'session_failed', {
      reason: summary,
      timedOut: true,
      exitCode: exitCode ?? null
    })
  }

  private async updateExecutionSummary(session: AcpSession, outputs?: Record<string, unknown>) {
    if (!session.executionId) {
      return
    }

    const execution = await this.executionService.findOne(session.executionId)
    await this.commandBus.execute(
      new XpertAgentExecutionUpsertCommand({
        id: session.executionId,
        status: this.executionMapper.toExecutionStatus(session.status),
        error: session.error ?? undefined,
        outputs: outputs ?? execution?.outputs,
        metadata: this.executionMapper.toExecutionMetadata(session, execution?.metadata ?? undefined)
      })
    )
  }
}

function normalizeTimeoutMs(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : DEFAULT_ACP_TIMEOUT_MS
}

function isTerminalStatus(status: IAcpSession['status']): boolean {
  return status === 'success' || status === 'error' || status === 'timeout' || status === 'canceled'
}
