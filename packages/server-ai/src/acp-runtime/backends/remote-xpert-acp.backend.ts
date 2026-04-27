import axios, { AxiosInstance } from 'axios'
import { createInterface } from 'node:readline'
import { Injectable, Logger } from '@nestjs/common'
import { buildCodexpertIdentityHeaders } from '../../codexpert'
import { requireBusinessPrincipal } from '../../shared/identity'
import { AcpRuntimeEnsureInput, AcpRuntimeEvent, AcpRuntimeHandle, AcpRuntimeTurnInput, IAcpBackend } from './acp-backend.types'

@Injectable()
export class RemoteXpertAcpBackend implements IAcpBackend {
  readonly #logger = new Logger(RemoteXpertAcpBackend.name)
  readonly kind = 'remote_xpert_acp'
  readonly harnessType = 'remote_xpert_acp'

  async ensureSession(input: AcpRuntimeEnsureInput): Promise<AcpRuntimeHandle> {
    const requestHeaders = buildContextHeaders(input.session)
    const client = this.createClient(input.target, requestHeaders)
    const endpoint = normalizeBaseUrl(input.target.commandOrEndpoint)
    const codeContext = readCodeContext(input.session.metadata)
    if (!endpoint) {
      throw new Error('remote_xpert_acp target requires commandOrEndpoint')
    }

    const { data } = await client.post(`${endpoint}/sessions`, {
      clientSessionId: input.session.clientSessionId ?? input.session.id,
      xpertId: codeContext.xpertId ?? input.session.xpertId ?? readString(input.target.metadata?.xpertId),
      sourceConversationId: codeContext.sourceConversationId ?? null,
      resumeThreadId: codeContext.resumeThreadId ?? null,
      conversationId: input.session.conversationId ?? null,
      threadId: input.session.threadId ?? null,
      environmentId: input.session.environmentId ?? null,
      projectId: readString(input.session.metadata?.projectId) ?? null,
      sandboxEnvironmentId: readString(input.session.metadata?.sandboxEnvironmentId) ?? null,
      codeContext,
      workingDirectory: input.session.workingDirectory ?? null,
      mode: input.session.mode,
      permissionProfile: input.session.permissionProfile,
      metadata: input.session.metadata ?? null
    })

    return {
      kind: 'remote_xpert_acp',
      harnessType: 'remote_xpert_acp',
      targetRef: input.target.id,
      backendSessionId: readString(data?.sessionId) ?? readString(data?.backendSessionId) ?? null,
      cwd: input.session.workingDirectory ?? null,
      metadata: {
        ...(isRecord(data) ? data : {}),
        target: input.target,
        requestHeaders
      }
    }
  }

  async *runTurn(input: AcpRuntimeTurnInput): AsyncIterable<AcpRuntimeEvent> {
    const endpoint = normalizeBaseUrl(input.target.commandOrEndpoint)
    if (!endpoint) {
      throw new Error('remote_xpert_acp target requires commandOrEndpoint')
    }
    if (!input.handle.backendSessionId) {
      throw new Error('remote_xpert_acp turn requires backendSessionId')
    }

    const codeContext = readCodeContext(input.session.metadata)
    const client = this.createClient(input.target, buildContextHeaders(input.session))
    const response = await client.post(
      `${endpoint}/sessions/${input.handle.backendSessionId}/prompts/stream`,
      {
        prompt: input.prompt,
        xpertId: codeContext.xpertId ?? input.session.xpertId ?? readString(input.target.metadata?.xpertId),
        requestId: input.requestId,
        executionId: input.executionId,
        turnIndex: input.turnIndex,
        sourceConversationId: codeContext.sourceConversationId ?? null,
        resumeThreadId: codeContext.resumeThreadId ?? null,
        environmentId: input.session.environmentId ?? null,
        projectId: readString(input.session.metadata?.projectId) ?? null,
        sandboxEnvironmentId: readString(input.session.metadata?.sandboxEnvironmentId) ?? null,
        codeContext,
        permissionProfile: input.permissionProfile,
        timeoutMs: input.timeoutMs,
        workingDirectory: input.session.workingDirectory ?? null,
        metadata: input.session.metadata ?? null
      },
      {
        responseType: 'stream',
        signal: input.signal,
        // ACP prompt streaming can stay idle for a long time while Codexpert is still working.
        // Keep the per-client default timeout for short control-plane calls, but disable it here
        // so the stream is not aborted after ~30s of inactivity.
        timeout: 0
      }
    )

    const stream = response.data as NodeJS.ReadableStream
    const lines = createInterface({ input: stream })
    let lineCount = 0
    let sawTerminalEvent = false
    try {
      for await (const line of lines) {
        const normalized = typeof line === 'string' ? line.trim() : ''
        if (!normalized) {
          continue
        }

        lineCount += 1
        const parsed = JSON.parse(normalized) as AcpRuntimeEvent
        if (parsed.type === 'done' || parsed.type === 'error') {
          sawTerminalEvent = true
        }
        yield parsed
      }
      if (!sawTerminalEvent) {
        const message = `Codexpert ACP stream closed before terminal event after ${lineCount} events`
        this.#logger.error(
          `ACP remote stream closed before terminal event: ${JSON.stringify({
            sessionId: input.session.id,
            backendSessionId: input.handle.backendSessionId,
            executionId: input.executionId,
            requestId: input.requestId,
            turnIndex: input.turnIndex,
            lineCount,
            aborted: input.signal?.aborted === true
          })}`
        )
        throw new Error(message)
      }
    } catch (error) {
      this.#logger.error(
        `ACP remote stream failed: ${JSON.stringify({
          sessionId: input.session.id,
          backendSessionId: input.handle.backendSessionId,
          executionId: input.executionId,
          requestId: input.requestId,
          turnIndex: input.turnIndex,
          lineCount,
          aborted: input.signal?.aborted === true,
          error: error instanceof Error ? error.message : String(error)
        })}`
      )
      throw error
    } finally {
      if (input.signal?.aborted && !sawTerminalEvent) {
        this.#logger.error(
          `ACP remote stream aborted: ${JSON.stringify({
            sessionId: input.session.id,
            backendSessionId: input.handle.backendSessionId,
            executionId: input.executionId,
            requestId: input.requestId,
            turnIndex: input.turnIndex,
            lineCount
          })}`
        )
      }
      lines.close()
      const destroyable = stream as unknown as { destroy?: () => void }
      if (typeof destroyable.destroy === 'function') {
        destroyable.destroy()
      }
    }
  }

  async cancel(input: { handle: AcpRuntimeHandle; reason?: string }): Promise<void> {
    if (!input.handle.backendSessionId) {
      return
    }

    await this.postSessionAction(input.handle, 'cancel', {
      reason: input.reason ?? 'Canceled by user'
    })
  }

  async close(input: { handle: AcpRuntimeHandle; reason?: string }): Promise<void> {
    if (!input.handle.backendSessionId) {
      return
    }

    await this.postSessionAction(input.handle, 'close', {
      reason: input.reason ?? 'Closed by user'
    })
  }

  private async postSessionAction(handle: AcpRuntimeHandle, action: 'cancel' | 'close', body: Record<string, unknown>) {
    const target = handle.metadata?.target as Record<string, unknown> | undefined
    const endpoint = normalizeBaseUrl(readString(target?.commandOrEndpoint))
    if (!endpoint || !handle.backendSessionId) {
      return
    }

    const client = this.createRawClient(
      target,
      isRecord(handle.metadata?.requestHeaders) ? (handle.metadata?.requestHeaders as Record<string, string>) : undefined
    )
    await client.post(`${endpoint}/sessions/${handle.backendSessionId}/${action}`, body)
  }

  private createClient(
    target: AcpRuntimeEnsureInput['target'] | AcpRuntimeTurnInput['target'],
    dynamicHeaders?: Record<string, string>
  ): AxiosInstance {
    return this.createRawClient(target, dynamicHeaders)
  }

  private createRawClient(
    target: Record<string, unknown> | null | undefined,
    dynamicHeaders?: Record<string, string>
  ): AxiosInstance {
    const authRef = readString(target?.authRef)
    const metadata = isRecord(target?.metadata) ? target?.metadata : {}
    const headers: Record<string, string> = {}

    if (authRef) {
      headers.Authorization = authRef.startsWith('Bearer ') ? authRef : `Bearer ${authRef}`
    }

    const extraHeaders = metadata?.headers
    if (isRecord(extraHeaders)) {
      for (const [key, value] of Object.entries(extraHeaders)) {
        if (typeof value === 'string' && value.length > 0) {
          headers[key] = value
        }
      }
    }

    if (dynamicHeaders) {
      for (const [key, value] of Object.entries(dynamicHeaders)) {
        if (typeof value === 'string' && value.length > 0) {
          headers[key] = value
        }
      }
    }

    return axios.create({
      headers,
      timeout: 30_000
    })
  }
}

function normalizeBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  return value.replace(/\/+$/, '')
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readCodeContext(metadata: Record<string, unknown> | null | undefined) {
  return {
    xpertId: readString(metadata?.xpertId) ?? null,
    projectId: readString(metadata?.projectId) ?? null,
    sourceConversationId: readString(metadata?.sourceConversationId) ?? null,
    resumeThreadId: readString(metadata?.resumeThreadId) ?? null,
    repoConnectionId: readString(metadata?.repoConnectionId) ?? null,
    repoId: readString(metadata?.repoId) ?? null,
    repoName: readString(metadata?.repoName) ?? null,
    repoOwner: readString(metadata?.repoOwner) ?? null,
    repoSlug: readString(metadata?.repoSlug) ?? null,
    branchName: readString(metadata?.branchName) ?? null,
    baseBranchName: readString(metadata?.baseBranchName) ?? null,
    workspaceLabel: readString(metadata?.workspaceLabel) ?? null,
    workspacePath: readString(metadata?.workspacePath) ?? null,
    codingAgentName: readString(metadata?.codingAgentName) ?? null,
    providerDisplayName: readString(metadata?.providerDisplayName) ?? null,
    taskKind: readString(metadata?.taskKind) ?? null,
    taskIntent: readString(metadata?.taskIntent) ?? null
  }
}

function buildContextHeaders(
  session:
    | Pick<AcpRuntimeEnsureInput['session'], 'metadata'>
    | Pick<AcpRuntimeTurnInput['session'], 'metadata'>
): Record<string, string> {
  return buildCodexpertIdentityHeaders(
    requireBusinessPrincipal(session.metadata?.businessPrincipal, 'remote Codexpert ACP session')
  )
}
