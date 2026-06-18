import type { ChatKitEventHandlers } from '@xpert-ai/chatkit-angular'
import type { XpertViewHostEventMessage } from '../../../@shared/view-extension/view-host-event-bus.service'

export type ClawXpertAssistantToolLogEvent = Parameters<NonNullable<ChatKitEventHandlers['onLog']>>[0]

export const ASSISTANT_TOOL_COMPLETED_EVENT = 'assistant.tool.completed'
export const CHATKIT_HOST_EVENT_SOURCE = 'chatkit'

type AssistantToolHostEventContext = {
  hostType: string
  hostId?: string | null
  threadId?: string | null
}

type ToolLogData = {
  toolName?: unknown
  toolCallId?: unknown
  tool_call_id?: unknown
  runId?: unknown
  durationMs?: unknown
  argsPreview?: unknown
  output?: unknown
  tool?: unknown
  name?: unknown
  status?: unknown
}

export function createAssistantToolCompletedHostEvent(
  event: ClawXpertAssistantToolLogEvent,
  context: AssistantToolHostEventContext
): XpertViewHostEventMessage | null {
  // ChatKit emits completed tools both as LangGraph lifecycle logs and as rendered component logs.
  // Keep this bridge app-agnostic; plugin-specific ids stay inside the remote component payload handling.
  const data = isToolLogData(event.data) ? event.data : null
  if (event.name === 'lg.tool.end') {
    return createLangGraphToolCompletedEvent(event, data, context)
  }

  if (event.name === 'component') {
    return createComponentToolCompletedEvent(event, data, context)
  }

  return null
}

function createLangGraphToolCompletedEvent(
  event: ClawXpertAssistantToolLogEvent,
  data: ToolLogData | null,
  context: AssistantToolHostEventContext
) {
  const toolName = readToolLogString(data?.toolName)
  if (!toolName) {
    return null
  }

  const receivedAt = new Date().toISOString()
  const toolCallId = readToolLogString(data?.toolCallId) ?? readToolLogString(data?.tool_call_id)
  const runId = readToolLogString(data?.runId)
  const durationMs = readToolLogNumber(data?.durationMs)

  return {
    id: createEventId([
      ASSISTANT_TOOL_COMPLETED_EVENT,
      context.hostId ?? undefined,
      toolCallId ?? undefined,
      runId ?? undefined,
      toolName,
      receivedAt
    ]),
    type: ASSISTANT_TOOL_COMPLETED_EVENT,
    source: CHATKIT_HOST_EVENT_SOURCE,
    receivedAt,
    hostType: context.hostType,
    ...(context.hostId ? { hostId: context.hostId } : {}),
    ...(context.threadId ? { threadId: context.threadId } : {}),
    toolName,
    ...(toolCallId ? { toolCallId } : {}),
    ...(runId ? { runId } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    data: {
      ...(data ?? {}),
      ...(isToolLogData(data?.output) ? { output: data.output } : {})
    }
  }
}

function createComponentToolCompletedEvent(
  event: ClawXpertAssistantToolLogEvent,
  data: ToolLogData | null,
  context: AssistantToolHostEventContext
) {
  // Tool result cards arrive through this path; normalize them without interpreting the output schema.
  const toolName = readToolLogString(data?.tool) ?? readToolLogString(data?.name)
  if (!toolName) {
    return null
  }

  const receivedAt = new Date().toISOString()
  const output = parseOutputObject(data?.output)

  return {
    id: createEventId([ASSISTANT_TOOL_COMPLETED_EVENT, context.hostId ?? undefined, toolName, receivedAt]),
    type: ASSISTANT_TOOL_COMPLETED_EVENT,
    source: CHATKIT_HOST_EVENT_SOURCE,
    receivedAt,
    hostType: context.hostType,
    ...(context.hostId ? { hostId: context.hostId } : {}),
    ...(context.threadId ? { threadId: context.threadId } : {}),
    toolName,
    data: {
      ...(data ?? {}),
      ...(output !== null ? { output } : {})
    }
  }
}

function parseOutputObject(value: unknown): Record<string, unknown> | null {
  // Parsed output remains opaque data for the subscribed plugin view.
  if (isToolLogData(value)) {
    return value
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return isToolLogData(parsed) ? parsed : null
  } catch {
    return null
  }
}

function createEventId(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(':') || `event:${Date.now()}`
}

function readToolLogString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readToolLogNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isToolLogData(value: unknown): value is ToolLogData {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
