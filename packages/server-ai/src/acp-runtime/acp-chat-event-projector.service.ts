import {
  CHAT_EVENT_TYPE_ACP_CONTROL_STATE,
  CHAT_EVENT_TYPE_ACP_OUTPUT,
  CHAT_EVENT_TYPE_ACP_STATUS,
  CHAT_EVENT_TYPE_ACP_TOOL,
  CHAT_EVENT_TYPE_ACP_TURN_STARTED,
  CHAT_EVENT_TYPE_ACP_TURN_TERMINAL,
  TAcpChatEvent,
  TAcpRuntimePhase
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { AcpRuntimeEvent, AcpRuntimePromptMode } from './backends/acp-backend.types'

type AcpProjectedTurn = {
  sessionId: string
  executionId: string
  turnIndex: number
  promptMode: AcpRuntimePromptMode
}

type AcpChatEventProjectorParams = {
  sessionId: string
  emit: (event: TAcpChatEvent) => Promise<void> | void
}

@Injectable()
export class AcpChatEventProjectorService {
  createProjector(params: AcpChatEventProjectorParams) {
    const emittedStatusKeys = new Map<number, string>()
    const toolKeys = new Map<string, string>()
    let anonymousToolIndex = 0

    const emit = async (event: TAcpChatEvent) => {
      await params.emit(event)
    }

    const emitControlState = async (input: {
      state: 'active' | 'queued' | 'waiting_input' | 'cancel_requested' | 'close_requested' | 'closed'
      headline: string
      executionId?: string | null
      turnIndex?: number | null
      phase?: TAcpRuntimePhase | null
      final?: boolean
      requiresAttention?: boolean
      message?: string | null
    }) => {
      await emit({
        type: CHAT_EVENT_TYPE_ACP_CONTROL_STATE,
        id: buildControlEventId(params.sessionId),
        sessionId: params.sessionId,
        executionId: input.executionId ?? null,
        turnIndex: input.turnIndex ?? null,
        phase: input.phase ?? null,
        headline: input.headline,
        requiresAttention: input.requiresAttention ?? false,
        final: input.final ?? false,
        state: input.state,
        ...(input.message ? { message: input.message } : {})
      })
    }

    const emitTurnStatus = async (
      turn: AcpProjectedTurn,
      input: {
        type:
          | typeof CHAT_EVENT_TYPE_ACP_TURN_STARTED
          | typeof CHAT_EVENT_TYPE_ACP_STATUS
          | typeof CHAT_EVENT_TYPE_ACP_TURN_TERMINAL
        headline: string
        phase?: TAcpRuntimePhase | null
        requiresAttention?: boolean
        final?: boolean
        message?: string | null
        details?: Record<string, unknown> | null
        status?: 'success' | 'error' | 'canceled'
        summary?: string | null
        error?: string | null
      }
    ) => {
      const eventBase = {
        id: buildTurnEventId(turn.sessionId, turn.turnIndex),
        sessionId: turn.sessionId,
        executionId: turn.executionId,
        turnIndex: turn.turnIndex,
        phase: input.phase ?? null,
        headline: input.headline,
        requiresAttention: input.requiresAttention ?? false,
        final: input.final ?? false
      }

      if (input.type === CHAT_EVENT_TYPE_ACP_TURN_STARTED) {
        await emit({
          type: CHAT_EVENT_TYPE_ACP_TURN_STARTED,
          ...eventBase,
          promptMode: turn.promptMode
        })
        return
      }

      if (input.type === CHAT_EVENT_TYPE_ACP_TURN_TERMINAL) {
        await emit({
          type: CHAT_EVENT_TYPE_ACP_TURN_TERMINAL,
          ...eventBase,
          status: input.status ?? 'success',
          ...(input.summary ? { summary: input.summary } : {}),
          ...(input.error ? { error: input.error } : {}),
          ...(input.details ? { details: input.details } : {})
        })
        return
      }

      await emit({
        type: CHAT_EVENT_TYPE_ACP_STATUS,
        ...eventBase,
        ...(input.message ? { message: input.message } : {}),
        ...(input.details ? { details: input.details } : {})
      })
    }

    return {
      emitControlState,
      async onTurnPrepared(turn: AcpProjectedTurn) {
        emittedStatusKeys.delete(turn.turnIndex)
        await emitControlState({
          state: 'active',
          headline: turn.promptMode === 'steer' ? 'Codexpert steer started' : 'Codexpert turn started',
          executionId: turn.executionId,
          turnIndex: turn.turnIndex,
          phase: 'running'
        })
        await emitTurnStatus(turn, {
          type: CHAT_EVENT_TYPE_ACP_TURN_STARTED,
          headline: turn.promptMode === 'steer' ? 'Codexpert steer started' : 'Codexpert turn started',
          phase: 'running'
        })
      },
      async onRuntimeEvent(turn: AcpProjectedTurn, event: AcpRuntimeEvent) {
        switch (event.type) {
          case 'text_delta': {
            if (event.stream && event.stream !== 'output') {
              return
            }
            if (!event.text) {
              return
            }
            await emit({
              type: CHAT_EVENT_TYPE_ACP_OUTPUT,
              id: buildOutputEventId(turn.sessionId, turn.turnIndex),
              sessionId: turn.sessionId,
              executionId: turn.executionId,
              turnIndex: turn.turnIndex,
              phase: event.phase ?? 'running',
              headline: event.headline ?? 'Codexpert output',
              requiresAttention: event.requiresAttention ?? false,
              final: false,
              text: event.text
            })
            return
          }
          case 'status': {
            if (!shouldEmitStatusEvent(event)) {
              return
            }
            const statusKey = `${event.phase ?? 'running'}|${event.headline ?? event.text ?? ''}`
            if (emittedStatusKeys.get(turn.turnIndex) === statusKey) {
              return
            }
            emittedStatusKeys.set(turn.turnIndex, statusKey)
            await emitTurnStatus(turn, {
              type: CHAT_EVENT_TYPE_ACP_STATUS,
              headline: event.headline ?? event.text,
              phase: event.phase ?? 'running',
              requiresAttention: event.requiresAttention ?? false,
              message: event.text,
              details: event.details ?? null
            })
            if (event.phase === 'queued') {
              await emitControlState({
                state: 'queued',
                headline: event.headline ?? event.text,
                executionId: turn.executionId,
                turnIndex: turn.turnIndex,
                phase: 'queued',
                message: event.text
              })
            }
            if (event.phase === 'waiting_input') {
              await emitControlState({
                state: 'waiting_input',
                headline: event.headline ?? event.text,
                executionId: turn.executionId,
                turnIndex: turn.turnIndex,
                phase: event.phase ?? 'waiting_input',
                requiresAttention: true,
                message: event.text
              })
            }
            return
          }
          case 'tool_call':
          case 'tool_call_update': {
            if (!shouldEmitToolEvent(event)) {
              return
            }
            const toolCallId = normalizeOptionalString(event.toolCallId) ?? `anonymous-${anonymousToolIndex++}`
            const toolKey = `${toolCallId}|${event.status ?? ''}|${event.title ?? event.text ?? ''}`
            if (toolKeys.get(toolCallId) === toolKey) {
              return
            }
            toolKeys.set(toolCallId, toolKey)
            await emit({
              type: CHAT_EVENT_TYPE_ACP_TOOL,
              id: buildToolEventId(turn.sessionId, toolCallId),
              sessionId: turn.sessionId,
              executionId: turn.executionId,
              turnIndex: turn.turnIndex,
              phase: event.phase ?? (event.status === 'failed' ? 'failed' : 'running'),
              headline: event.title ?? event.text,
              requiresAttention: event.requiresAttention ?? event.status === 'failed',
              final: isTerminalToolStatus(event.status),
              toolCallId: event.toolCallId ?? null,
              toolStatus: event.status ?? null,
              message: event.text,
              details: {
                ...(event.rawInput ? { rawInput: event.rawInput } : {}),
                ...(event.rawOutput !== undefined ? { rawOutput: event.rawOutput } : {})
              }
            })
            return
          }
          case 'done': {
            await emitTurnStatus(turn, {
              type: CHAT_EVENT_TYPE_ACP_TURN_TERMINAL,
              headline: event.headline ?? event.summary ?? 'Codexpert turn completed',
              phase: event.phase ?? (event.stopReason === 'cancelled' ? 'canceled' : 'completed'),
              requiresAttention: event.requiresAttention ?? false,
              final: true,
              status: event.stopReason === 'cancelled' ? 'canceled' : 'success',
              summary: event.summary ?? event.output ?? null,
              details: event.details ?? null
            })
            return
          }
          case 'error': {
            await emitTurnStatus(turn, {
              type: CHAT_EVENT_TYPE_ACP_TURN_TERMINAL,
              headline: event.headline ?? event.message ?? 'Codexpert turn failed',
              phase: event.phase ?? (event.code === 'canceled' ? 'canceled' : 'failed'),
              requiresAttention: event.requiresAttention ?? event.code !== 'canceled',
              final: true,
              status: event.code === 'canceled' ? 'canceled' : 'error',
              error: event.message,
              details: event.details ?? null
            })
            return
          }
          default:
            return
        }
      },
      async onBridgeClosed(input: {
        executionId?: string | null
        turnIndex?: number | null
        phase?: TAcpRuntimePhase | null
        headline: string
      }) {
        await emitControlState({
          state: 'closed',
          headline: input.headline,
          executionId: input.executionId ?? null,
          turnIndex: input.turnIndex ?? null,
          phase: input.phase ?? null,
          final: true
        })
      }
    }
  }
}

function buildControlEventId(sessionId: string) {
  return `acp-control:${sessionId}`
}

function buildTurnEventId(sessionId: string, turnIndex: number) {
  return `acp-turn:${sessionId}:${turnIndex}`
}

function buildOutputEventId(sessionId: string, turnIndex: number) {
  return `acp-output:${sessionId}:${turnIndex}`
}

function buildToolEventId(sessionId: string, toolCallId: string) {
  return `acp-tool:${sessionId}:${toolCallId}`
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function shouldEmitStatusEvent(event: Extract<AcpRuntimeEvent, { type: 'status' }>) {
  if (event.phase === 'waiting_input' || event.requiresAttention) {
    return true
  }

  return event.isMilestone === true || ['queued', 'running', 'completed', 'failed', 'canceled'].includes(event.phase ?? '')
}

function shouldEmitToolEvent(
  event: Extract<AcpRuntimeEvent, { type: 'tool_call' | 'tool_call_update' }>
) {
  if (event.type === 'tool_call') {
    return true
  }

  return isTerminalToolStatus(event.status) || event.isMilestone === true || event.requiresAttention === true
}

function isTerminalToolStatus(value: unknown) {
  if (typeof value !== 'string') {
    return false
  }
  return ['completed', 'failed', 'success', 'error', 'canceled'].includes(value.trim().toLowerCase())
}
