import { TAcpChatEvent, TAcpRuntimePhase, TMessageContentText } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { AcpRuntimeEvent } from './backends/acp-backend.types'
import { AcpChatEventProjectorService } from './acp-chat-event-projector.service'
import { AcpRuntimeService } from './acp-runtime.service'

type BridgePromptCommand = {
  kind: 'prompt'
  prompt: string
  title?: string
  promptMode: 'prompt' | 'steer'
  timeoutMs?: number
}

type BridgeCloseRequest = {
  kind: 'cancel' | 'close'
  reason: string
}

export type AcpBridgeTerminalResult = {
  sessionId: string
  executionId: string | null
  turnIndex: number | null
  status: 'success' | 'error' | 'canceled'
  output?: string | null
  summary?: string | null
  error?: string | null
}

type AcpVisibleTextPayload = string | TMessageContentText

type VisibleTextProjection = {
  text: string
  kind: 'output' | 'milestone' | 'terminal' | 'error'
  milestoneKind?: VisibleMilestoneKind
}

type ActiveAcpSessionBridge = {
  key: string
  conversationId: string
  sessionId: string
  emitText?: (payload: AcpVisibleTextPayload) => Promise<void> | void
  commandQueue: BridgePromptCommand[]
  closeRequest: BridgeCloseRequest | null
  waitingResolver: (() => void) | null
  waitingForInput: boolean
  activeTurn:
    | {
        executionId: string
        turnIndex: number
        requestId: string
        promptMode: 'prompt' | 'steer'
      }
    | null
  lastTurn:
    | {
        executionId: string | null
        turnIndex: number | null
        phase?: TAcpRuntimePhase | null
      }
    | null
  lastTerminalResult: AcpBridgeTerminalResult | null
  projector: ReturnType<AcpChatEventProjectorService['createProjector']>
  terminalPromise: Promise<AcpBridgeTerminalResult>
  resolveTerminal: (result: AcpBridgeTerminalResult) => void
  rejectTerminal: (error: unknown) => void
}

@Injectable()
export class AcpSessionBridgeService {
  readonly #logger = new Logger(AcpSessionBridgeService.name)
  readonly #bridgesByKey = new Map<string, ActiveAcpSessionBridge>()
  readonly #bridgeSessionIdsByConversation = new Map<string, string>()

  constructor(
    private readonly runtimeService: AcpRuntimeService,
    private readonly chatEventProjector: AcpChatEventProjectorService
  ) {}

  hasActiveBridgeForConversation(conversationId: string | null | undefined) {
    const normalized = normalizeOptionalString(conversationId)
    return normalized ? this.#bridgeSessionIdsByConversation.has(normalized) : false
  }

  getActiveBridgeSessionIdForConversation(conversationId: string | null | undefined) {
    const normalized = normalizeOptionalString(conversationId)
    return normalized ? this.#bridgeSessionIdsByConversation.get(normalized) ?? null : null
  }

  hasActiveBridge(sessionId: string | null | undefined) {
    const normalized = normalizeOptionalString(sessionId)
    if (!normalized) {
      return false
    }

    for (const bridge of this.#bridgesByKey.values()) {
      if (bridge.sessionId === normalized) {
        return true
      }
    }

    return false
  }

  async startPrompt(input: {
    conversationId: string
    sessionId: string
    prompt: string
    title?: string
    timeoutMs?: number
    emit: (event: TAcpChatEvent) => Promise<void> | void
    emitText?: (payload: AcpVisibleTextPayload) => Promise<void> | void
  }): Promise<AcpBridgeTerminalResult> {
    const conversationId = normalizeRequiredString(input.conversationId, 'conversationId is required for ACP bridge')
    const sessionId = normalizeRequiredString(input.sessionId, 'sessionId is required for ACP bridge')
    const prompt = normalizeRequiredString(input.prompt, 'ACP bridge prompt is required')
    const key = buildBridgeKey(conversationId, sessionId)

    const existingSessionId = this.#bridgeSessionIdsByConversation.get(conversationId)
    if (existingSessionId && existingSessionId !== sessionId) {
      throw new Error(`ACP bridge is already active for conversation ${conversationId}`)
    }

    const existing = this.#bridgesByKey.get(key)
    if (existing) {
      throw new Error(`ACP bridge is already active for session ${sessionId}`)
    }

    let resolveTerminal!: (result: AcpBridgeTerminalResult) => void
    let rejectTerminal!: (error: unknown) => void
    const terminalPromise = new Promise<AcpBridgeTerminalResult>((resolve, reject) => {
      resolveTerminal = resolve
      rejectTerminal = reject
    })

    const projector = this.chatEventProjector.createProjector({
      sessionId,
      emit: input.emit
    })
    const bridge: ActiveAcpSessionBridge = {
      key,
      conversationId,
      sessionId,
      emitText: input.emitText,
      commandQueue: [
        {
          kind: 'prompt',
          prompt,
          title: input.title,
          promptMode: 'prompt',
          timeoutMs: input.timeoutMs
        }
      ],
      closeRequest: null,
      waitingResolver: null,
      waitingForInput: false,
      activeTurn: null,
      lastTurn: null,
      lastTerminalResult: null,
      projector,
      terminalPromise,
      resolveTerminal,
      rejectTerminal
    }

    this.#bridgesByKey.set(key, bridge)
    this.#bridgeSessionIdsByConversation.set(conversationId, sessionId)
    void this.runBridge(bridge).catch((error) => {
      this.#logger.error(
        {
          err: error,
          sessionId: bridge.sessionId,
          conversationId: bridge.conversationId
        },
        'ACP bridge loop failed'
      )
      bridge.rejectTerminal(error)
      this.cleanupBridge(bridge)
    })

    return await bridge.terminalPromise
  }

  async queuePrompt(
    sessionId: string,
    input: {
      prompt: string
      title?: string
      timeoutMs?: number
    }
  ) {
    const bridge = this.requireBridge(sessionId)
    bridge.commandQueue.push({
      kind: 'prompt',
      prompt: normalizeRequiredString(input.prompt, 'ACP queue prompt is required'),
      title: input.title,
      timeoutMs: input.timeoutMs,
      promptMode: 'prompt'
    })
    await bridge.projector.emitControlState({
      state: 'queued',
      headline: input.title?.trim() || 'Codexpert follow-up queued',
      executionId: bridge.activeTurn?.executionId ?? bridge.lastTurn?.executionId ?? null,
      turnIndex: bridge.activeTurn?.turnIndex ?? bridge.lastTurn?.turnIndex ?? null,
      phase: bridge.activeTurn ? 'running' : bridge.waitingForInput ? 'waiting_input' : 'queued',
      message: input.prompt
    })
    this.notifyBridge(bridge)
    return await this.runtimeService.getSessionStatus(sessionId)
  }

  async interruptAndSteer(
    sessionId: string,
    input: {
      prompt: string
      title?: string
      timeoutMs?: number
      reason?: string
    }
  ) {
    const bridge = this.requireBridge(sessionId)
    bridge.commandQueue.unshift({
      kind: 'prompt',
      prompt: normalizeRequiredString(input.prompt, 'ACP steer prompt is required'),
      title: input.title,
      timeoutMs: input.timeoutMs,
      promptMode: 'steer'
    })
    await bridge.projector.emitControlState({
      state: 'cancel_requested',
      headline: input.title?.trim() || 'Codexpert steer requested',
      executionId: bridge.activeTurn?.executionId ?? bridge.lastTurn?.executionId ?? null,
      turnIndex: bridge.activeTurn?.turnIndex ?? bridge.lastTurn?.turnIndex ?? null,
      phase: bridge.activeTurn
        ? 'running'
        : bridge.waitingForInput
          ? 'waiting_input'
          : (bridge.lastTurn?.phase ?? 'running'),
      message: input.prompt
    })

    if (bridge.activeTurn) {
      await this.runtimeService.cancelSession(sessionId, input.reason ?? 'Interrupted by ACP bridge steer', {
        deliveryMode: 'inline_bridge'
      })
    } else {
      this.notifyBridge(bridge)
    }

    return await this.runtimeService.getSessionStatus(sessionId)
  }

  async cancel(sessionId: string, reason = 'Canceled by user') {
    const bridge = this.requireBridge(sessionId)
    bridge.commandQueue = []
    bridge.closeRequest = {
      kind: 'cancel',
      reason
    }
    await bridge.projector.emitControlState({
      state: 'cancel_requested',
      headline: reason,
      executionId: bridge.activeTurn?.executionId ?? bridge.lastTurn?.executionId ?? null,
      turnIndex: bridge.activeTurn?.turnIndex ?? bridge.lastTurn?.turnIndex ?? null,
      phase: bridge.activeTurn
        ? 'running'
        : bridge.waitingForInput
          ? 'waiting_input'
          : (bridge.lastTurn?.phase ?? 'canceled'),
      message: reason
    })

    if (bridge.activeTurn) {
      await this.runtimeService.cancelSession(sessionId, reason, {
        deliveryMode: 'inline_bridge'
      })
    } else {
      this.notifyBridge(bridge)
    }

    return await this.runtimeService.getSessionStatus(sessionId)
  }

  async close(sessionId: string, reason = 'Closed by user') {
    const bridge = this.requireBridge(sessionId)
    bridge.commandQueue = []
    bridge.closeRequest = {
      kind: 'close',
      reason
    }
    await bridge.projector.emitControlState({
      state: 'close_requested',
      headline: reason,
      executionId: bridge.activeTurn?.executionId ?? bridge.lastTurn?.executionId ?? null,
      turnIndex: bridge.activeTurn?.turnIndex ?? bridge.lastTurn?.turnIndex ?? null,
      phase: bridge.activeTurn
        ? 'running'
        : bridge.waitingForInput
          ? 'waiting_input'
          : (bridge.lastTurn?.phase ?? 'completed'),
      message: reason
    })

    if (bridge.activeTurn) {
      await this.runtimeService.cancelSession(sessionId, reason, {
        deliveryMode: 'inline_bridge'
      })
    } else {
      await this.runtimeService.closeSession(sessionId, reason, {
        deliveryMode: 'inline_bridge'
      })
      this.notifyBridge(bridge)
    }

    return await this.runtimeService.getSessionStatus(sessionId)
  }

  async getStatus(sessionId: string) {
    this.requireBridge(sessionId)
    return await this.runtimeService.getSessionStatus(sessionId)
  }

  private async runBridge(bridge: ActiveAcpSessionBridge) {
    let nextCommand = this.shiftNextCommand(bridge)
    if (!nextCommand) {
      bridge.resolveTerminal(this.resolveFallbackResult(bridge, 'canceled', 'ACP bridge closed before start'))
      this.cleanupBridge(bridge)
      return
    }

    while (nextCommand) {
      const turnResult = await this.runBridgeTurn(bridge, nextCommand)
      bridge.lastTerminalResult = turnResult.result
      bridge.lastTurn = {
        executionId: turnResult.result.executionId,
        turnIndex: turnResult.result.turnIndex,
        phase: turnResult.phase
      }

      if (bridge.closeRequest) {
        if (bridge.closeRequest.kind === 'close') {
          await this.runtimeService.closeSession(bridge.sessionId, bridge.closeRequest.reason, {
            deliveryMode: 'inline_bridge'
          }).catch((error) => {
            this.#logger.warn(`Failed to close ACP session ${bridge.sessionId}: ${error}`)
          })
        }

        const terminalResult: AcpBridgeTerminalResult =
          bridge.closeRequest.kind === 'close'
            ? {
                ...this.resolveFallbackResult(bridge, 'canceled', bridge.closeRequest.reason),
                executionId: turnResult.result.executionId,
                turnIndex: turnResult.result.turnIndex
              }
            : {
                ...turnResult.result,
                status: 'canceled',
                error: bridge.closeRequest.reason
              }

        await bridge.projector.onBridgeClosed({
          executionId: terminalResult.executionId,
          turnIndex: terminalResult.turnIndex,
          phase: turnResult.phase ?? 'canceled',
          headline: bridge.closeRequest.reason
        })
        bridge.resolveTerminal(terminalResult)
        this.cleanupBridge(bridge)
        return
      }

      nextCommand = this.shiftNextCommand(bridge)
      if (nextCommand) {
        continue
      }

      if (turnResult.waitingForInput) {
        nextCommand = await this.waitForNextCommand(bridge)
        if (!nextCommand && bridge.closeRequest) {
          const terminalResult = await this.finishCloseRequest(bridge, turnResult)
          bridge.resolveTerminal(terminalResult)
          this.cleanupBridge(bridge)
          return
        }
        continue
      }

      await bridge.projector.onBridgeClosed({
        executionId: turnResult.result.executionId,
        turnIndex: turnResult.result.turnIndex,
        phase: turnResult.phase ?? (turnResult.result.status === 'success' ? 'completed' : 'failed'),
        headline: turnResult.result.summary ?? turnResult.result.error ?? 'Codexpert bridge completed'
      })
      bridge.resolveTerminal(turnResult.result)
      this.cleanupBridge(bridge)
      return
    }

    bridge.resolveTerminal(
      bridge.lastTerminalResult ?? this.resolveFallbackResult(bridge, 'canceled', 'ACP bridge closed')
    )
    this.cleanupBridge(bridge)
  }

  private async runBridgeTurn(bridge: ActiveAcpSessionBridge, command: BridgePromptCommand) {
    let waitingForInput = false
    let phase: TAcpRuntimePhase | null = null
    let result: AcpBridgeTerminalResult | null = null
    let streamedOutput = ''
    const visibleProjectionState = createVisibleProjectionState()

    for await (const event of this.runtimeService.runTurnStream({
      sessionId: bridge.sessionId,
      prompt: command.prompt,
      title: command.title,
      timeoutMs: command.timeoutMs,
      promptMode: command.promptMode,
      deliveryMode: 'inline_bridge',
      onTurnPrepared: async (turn) => {
        bridge.waitingForInput = false
        bridge.activeTurn = {
          executionId: turn.executionId,
          turnIndex: turn.turnIndex,
          requestId: turn.requestId,
          promptMode: turn.promptMode
        }
        bridge.lastTurn = {
          executionId: turn.executionId,
          turnIndex: turn.turnIndex,
          phase: 'running'
        }
        await bridge.projector.onTurnPrepared({
          sessionId: turn.sessionId,
          executionId: turn.executionId,
          turnIndex: turn.turnIndex,
          promptMode: turn.promptMode
        })
      }
    })) {
      const activeTurn = bridge.activeTurn ?? {
        executionId: bridge.lastTurn?.executionId ?? '',
        turnIndex: bridge.lastTurn?.turnIndex ?? 0,
        requestId: '',
        promptMode: command.promptMode
      }
      await bridge.projector.onRuntimeEvent(
        {
          sessionId: bridge.sessionId,
          executionId: activeTurn.executionId,
          turnIndex: activeTurn.turnIndex,
          promptMode: activeTurn.promptMode
        },
        event
      )

      if (event.phase) {
        phase = event.phase
      }

      if (event.phase === 'waiting_input') {
        waitingForInput = true
        bridge.waitingForInput = true
      }

      const visibleTexts = projectVisibleRuntimeTexts(event, visibleProjectionState, streamedOutput)
      for (const projection of visibleTexts) {
        await emitVisibleText(bridge, activeTurn, projection)
      }

      if (event.type === 'text_delta' && shouldAccumulateOutputText(event, streamedOutput)) {
        streamedOutput += event.text
      }

      if (event.type === 'done') {
        const finalOutput = firstNonEmptyString(event.output, streamedOutput)
        result = {
          sessionId: bridge.sessionId,
          executionId: activeTurn.executionId,
          turnIndex: activeTurn.turnIndex,
          status: event.stopReason === 'cancelled' ? 'canceled' : 'success',
          output: finalOutput,
          summary: firstNonEmptyString(event.summary, finalOutput),
          error: null
        }
      } else if (event.type === 'error') {
        result = {
          sessionId: bridge.sessionId,
          executionId: activeTurn.executionId,
          turnIndex: activeTurn.turnIndex,
          status: event.code === 'canceled' ? 'canceled' : 'error',
          output: null,
          summary: null,
          error: event.message
        }
      }
    }

    if (!result && !waitingForInput) {
      this.#logger.error(
        `ACP bridge turn ended without terminal event: ${JSON.stringify({
          sessionId: bridge.sessionId,
          conversationId: bridge.conversationId,
          executionId: bridge.lastTurn?.executionId ?? bridge.activeTurn?.executionId ?? null,
          turnIndex: bridge.lastTurn?.turnIndex ?? bridge.activeTurn?.turnIndex ?? null,
          promptMode: command.promptMode,
          phase
        })}`
      )
      result = {
        sessionId: bridge.sessionId,
        executionId: bridge.lastTurn?.executionId ?? null,
        turnIndex: bridge.lastTurn?.turnIndex ?? null,
        status: 'error',
        output: firstNonEmptyString(streamedOutput),
        summary: firstNonEmptyString(streamedOutput),
        error: 'Codexpert ACP stream ended before a terminal event'
      }
    }

    bridge.activeTurn = null

    return {
      waitingForInput,
      phase,
      result:
        result ??
        {
          sessionId: bridge.sessionId,
          executionId: bridge.lastTurn?.executionId ?? null,
          turnIndex: bridge.lastTurn?.turnIndex ?? null,
          status: waitingForInput ? 'success' : 'error',
          output: firstNonEmptyString(streamedOutput),
          summary: firstNonEmptyString(streamedOutput),
          error: waitingForInput ? null : 'Codexpert ACP stream ended before a terminal event'
        }
    }
  }

  private waitForNextCommand(bridge: ActiveAcpSessionBridge): Promise<BridgePromptCommand | null> {
    const queued = this.shiftNextCommand(bridge)
    if (queued) {
      return Promise.resolve(queued)
    }

    if (bridge.closeRequest) {
      return Promise.resolve(null)
    }

    return new Promise<BridgePromptCommand | null>((resolve) => {
      bridge.waitingResolver = () => {
        bridge.waitingResolver = null
        resolve(this.shiftNextCommand(bridge))
      }
    })
  }

  private shiftNextCommand(bridge: ActiveAcpSessionBridge): BridgePromptCommand | null {
    if (bridge.commandQueue.length > 0) {
      return bridge.commandQueue.shift() ?? null
    }

    return bridge.closeRequest ? null : null
  }

  private notifyBridge(bridge: ActiveAcpSessionBridge) {
    const resolver = bridge.waitingResolver
    bridge.waitingResolver = null
    resolver?.()
  }

  private cleanupBridge(bridge: ActiveAcpSessionBridge) {
    this.#bridgesByKey.delete(bridge.key)
    if (this.#bridgeSessionIdsByConversation.get(bridge.conversationId) === bridge.sessionId) {
      this.#bridgeSessionIdsByConversation.delete(bridge.conversationId)
    }
  }

  private async finishCloseRequest(
    bridge: ActiveAcpSessionBridge,
    turnResult: {
      result: AcpBridgeTerminalResult
      phase: TAcpRuntimePhase | null
    }
  ) {
    const closeRequest = bridge.closeRequest
    if (!closeRequest) {
      return turnResult.result
    }

    if (closeRequest.kind === 'close') {
      await this.runtimeService
        .closeSession(bridge.sessionId, closeRequest.reason, {
          deliveryMode: 'inline_bridge'
        })
        .catch((error) => {
          this.#logger.warn(`Failed to close ACP session ${bridge.sessionId}: ${error}`)
        })
    }

    const terminalResult =
      closeRequest.kind === 'close'
        ? {
            ...this.resolveFallbackResult(bridge, 'canceled', closeRequest.reason),
            executionId: turnResult.result.executionId,
            turnIndex: turnResult.result.turnIndex
          }
        : {
            ...turnResult.result,
            status: 'canceled' as const,
            error: closeRequest.reason
          }

    await bridge.projector.onBridgeClosed({
      executionId: terminalResult.executionId,
      turnIndex: terminalResult.turnIndex,
      phase: turnResult.phase ?? 'canceled',
      headline: closeRequest.reason
    })

    return terminalResult
  }

  private requireBridge(sessionId: string) {
    const normalized = normalizeRequiredString(sessionId, 'ACP bridge sessionId is required')
    for (const bridge of this.#bridgesByKey.values()) {
      if (bridge.sessionId === normalized) {
        return bridge
      }
    }

    throw new Error(`ACP bridge ${normalized} is not active`)
  }

  private resolveFallbackResult(
    bridge: Pick<ActiveAcpSessionBridge, 'sessionId' | 'lastTurn'>,
    status: AcpBridgeTerminalResult['status'],
    message: string
  ): AcpBridgeTerminalResult {
    return {
      sessionId: bridge.sessionId,
      executionId: bridge.lastTurn?.executionId ?? null,
      turnIndex: bridge.lastTurn?.turnIndex ?? null,
      status,
      output: null,
      summary: status === 'success' ? message : null,
      error: status === 'success' ? null : message
    }
  }
}

function buildBridgeKey(conversationId: string, sessionId: string) {
  return `${conversationId}:${sessionId}`
}

function createVisibleProjectionState() {
  return {
    milestones: new Set<VisibleMilestoneKind>()
  }
}

type VisibleMilestoneKind = 'queued' | 'turn_started' | 'waiting_input' | 'completed' | 'failed' | 'canceled'

function projectVisibleRuntimeTexts(
  event: AcpRuntimeEvent,
  state: {
    milestones: Set<VisibleMilestoneKind>
  },
  streamedOutput: string
): VisibleTextProjection[] {
  switch (event.type) {
    case 'text_delta':
      if (event.stream !== 'output' || event.tag === 'setup' || !hasRenderableText(event.text)) {
        return []
      }

      if (event.tag === 'assistant_snapshot' && isDuplicateVisibleText(event.text, streamedOutput)) {
        return []
      }

      return [
        {
          kind: 'output',
          text: event.text
        }
      ]
    case 'status': {
      const milestone = resolveVisibleStatusMilestone(event)
      if (!milestone || state.milestones.has(milestone.kind)) {
        return []
      }

      state.milestones.add(milestone.kind)
      return [
        {
          kind: 'milestone',
          milestoneKind: milestone.kind,
          text: milestone.text
        }
      ]
    }
    case 'done': {
      const kind = event.stopReason === 'cancelled' ? 'canceled' : 'completed'
      if (state.milestones.has(kind)) {
        return []
      }

      state.milestones.add(kind)
      const terminalText = firstNonEmptyString(event.summary, event.output)
      if (terminalText && !isDuplicateVisibleText(terminalText, streamedOutput)) {
        return [
          {
            kind: 'terminal',
            milestoneKind: kind,
            text: isGenericTerminalSummary(kind, terminalText) ? defaultMilestoneText(kind) : terminalText
          }
        ]
      }

      return [
        {
          kind: 'terminal',
          milestoneKind: kind,
          text: defaultMilestoneText(kind)
        }
      ]
    }
    case 'error': {
      const kind = event.code === 'canceled' ? 'canceled' : 'failed'
      if (state.milestones.has(kind)) {
        return []
      }

      state.milestones.add(kind)
      return [
        {
          kind: 'error',
          milestoneKind: kind,
          text: formatErrorVisibleText(event.message, kind)
        }
      ]
    }
    default:
      return []
  }
}

function resolveVisibleStatusMilestone(event: Extract<AcpRuntimeEvent, { type: 'status' }>): {
  kind: VisibleMilestoneKind
  text: string
} | null {
  if (event.phase === 'queued') {
    return {
      kind: 'queued',
      text: 'Codexpert：任务已进入队列。'
    }
  }

  if (event.phase === 'waiting_input') {
    const message = firstNonEmptyString(event.headline, event.text)
    return {
      kind: 'waiting_input',
      text:
        message && !isGenericStatusMessage(message)
          ? prefixCodexpert(message)
          : 'Codexpert：需要你提供更多信息。'
    }
  }

  if (event.phase === 'running' && event.isMilestone && isTurnStartedStatus(event)) {
    return {
      kind: 'turn_started',
      text: 'Codexpert：已开始处理。'
    }
  }

  return null
}

function isTurnStartedStatus(event: Extract<AcpRuntimeEvent, { type: 'status' }>) {
  const text = normalizeComparableText(firstNonEmptyString(event.headline, event.text))
  if (!text) {
    return false
  }

  return (
    text.includes('run started') ||
    text.includes('task started') ||
    text.includes('turn started') ||
    text.includes('entered run phase') ||
    text.includes('started with existing environment')
  )
}

function isGenericTerminalSummary(kind: 'completed' | 'canceled', text: string) {
  const normalized = normalizeComparableText(text)
  if (!normalized) {
    return true
  }

  if (kind === 'completed') {
    return normalized === 'codexpert run completed' || normalized === 'codexpert task completed'
  }

  return normalized === 'codexpert run canceled' || normalized === 'codexpert task canceled'
}

function defaultMilestoneText(kind: 'completed' | 'canceled') {
  return kind === 'canceled' ? 'Codexpert：任务已取消。' : 'Codexpert：任务已完成。'
}

function formatErrorVisibleText(message: string, kind: 'failed' | 'canceled') {
  if (kind === 'canceled') {
    return 'Codexpert：任务已取消。'
  }

  return prefixCodexpert(hasRenderableText(message) ? message : '任务执行失败。')
}

function isDuplicateVisibleText(text: string, streamedOutput: string) {
  const normalizedText = normalizeComparableText(text)
  const normalizedOutput = normalizeComparableText(streamedOutput)
  return Boolean(normalizedText && normalizedOutput && normalizedText === normalizedOutput)
}

function shouldAccumulateOutputText(event: AcpRuntimeEvent, streamedOutput: string) {
  if (event.type !== 'text_delta' || event.stream === 'thought' || !event.text || event.tag === 'setup') {
    return false
  }

  if (event.tag === 'assistant_snapshot' && isDuplicateVisibleText(event.text, streamedOutput)) {
    return false
  }

  return true
}

function normalizeComparableText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.replace(/\s+/g, ' ').trim().toLowerCase() : null
}

function isGenericStatusMessage(value: string) {
  const normalized = normalizeComparableText(value)
  if (!normalized) {
    return true
  }

  return (
    normalized === 'on_interrupt' ||
    normalized === 'status_update' ||
    normalized === 'codexpert turn queued' ||
    normalized === 'codexpert run started'
  )
}

function prefixCodexpert(value: string) {
  return value.startsWith('Codexpert：') ? value : `Codexpert：${value}`
}

async function emitVisibleText(
  bridge: Pick<ActiveAcpSessionBridge, 'emitText' | 'sessionId'>,
  turn: Pick<NonNullable<ActiveAcpSessionBridge['activeTurn']>, 'turnIndex'>,
  projection: VisibleTextProjection
) {
  if (!bridge.emitText || !hasRenderableText(projection.text)) {
    return
  }

  await bridge.emitText(createCodexpertVisibleTextPayload(bridge.sessionId, turn.turnIndex, projection))
}

function createCodexpertVisibleTextPayload(
  sessionId: string,
  turnIndex: number,
  projection: VisibleTextProjection
): TMessageContentText {
  return {
    type: 'text',
    text: projection.text,
    id: `acp:${sessionId}:${turnIndex}:${projection.milestoneKind ?? projection.kind}`,
    xpertName: 'Codexpert',
    agentKey: 'codexpert'
  }
}

function hasRenderableText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function firstNonEmptyString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return null
}

function normalizeRequiredString(value: unknown, errorMessage: string) {
  const normalized = normalizeOptionalString(value)
  if (!normalized) {
    throw new Error(errorMessage)
  }
  return normalized
}
