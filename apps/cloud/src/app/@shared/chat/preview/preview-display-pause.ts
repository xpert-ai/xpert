import {
  ChatMessageStatusEnum,
  CopilotMessageType,
  IChatMessage,
  TMessageContent,
  TMessageContentReasoning,
  XpertAgentExecutionStatusEnum
} from '@cloud/app/@core'

const PREVIEW_MESSAGE_ROLES = [
  'ai',
  'human',
  'system',
  'tool',
  'function',
  'generic',
  'developer',
  'remove',
  'assistant',
  'user',
  'info',
  'component'
] as const

const PREVIEW_MESSAGE_STATUSES = [
  XpertAgentExecutionStatusEnum.RUNNING,
  XpertAgentExecutionStatusEnum.SUCCESS,
  XpertAgentExecutionStatusEnum.ERROR,
  XpertAgentExecutionStatusEnum.PENDING,
  XpertAgentExecutionStatusEnum.TIMEOUT,
  XpertAgentExecutionStatusEnum.INTERRUPTED,
  'thinking',
  'reasoning',
  'answering',
  'aborted'
] as const

interface PreviewPauseSnapshotMessage {
  id: string
  role: CopilotMessageType
  content?: string | TMessageContent
  status?: ChatMessageStatusEnum
  executionId?: string
  reasoning?: TMessageContentReasoning[]
}

function isPlainObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPreviewRole(value: string): value is CopilotMessageType {
  return (PREVIEW_MESSAGE_ROLES as readonly string[]).includes(value)
}

function isPreviewStatus(value: string): value is ChatMessageStatusEnum {
  return (PREVIEW_MESSAGE_STATUSES as readonly string[]).includes(value)
}

function resolvePreviewRole(type: string): CopilotMessageType | null {
  if (type === 'user') {
    return 'human'
  }
  if (type === 'assistant') {
    return 'ai'
  }
  return isPreviewRole(type) ? type : null
}

function isMessageContent(value: unknown): value is string | TMessageContent {
  if (typeof value === 'string') {
    return true
  }
  if (!Array.isArray(value)) {
    return false
  }
  return value.every((part) => isPlainObject(part) && 'type' in part && typeof part.type === 'string')
}

function isReasoningList(value: unknown): value is TMessageContentReasoning[] {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every((part) => isPlainObject(part) && 'type' in part && part.type === 'reasoning')
}

function parsePreviewPauseSnapshot(snapshot: string | null | undefined): PreviewPauseSnapshotMessage[] | null {
  if (!snapshot?.trim()) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (!isPlainObject(parsed) || !('version' in parsed) || parsed.version !== 1) {
      return null
    }
    if (!('messages' in parsed) || !Array.isArray(parsed.messages)) {
      return null
    }
    const messages = parsed.messages.flatMap((item) => {
      const frozen = readSnapshotMessage(item)
      return frozen ? [frozen] : []
    })
    return messages.length ? messages : null
  } catch {
    return null
  }
}

function readSnapshotMessage(value: unknown): PreviewPauseSnapshotMessage | null {
  if (!isPlainObject(value) || !('type' in value) || typeof value.type !== 'string') {
    return null
  }
  if (!('id' in value) || typeof value.id !== 'string' || !value.id) {
    return null
  }
  const role = resolvePreviewRole(value.type)
  if (!role) {
    return null
  }
  const content = 'content' in value && isMessageContent(value.content) ? value.content : undefined
  const status =
    'status' in value && typeof value.status === 'string' && isPreviewStatus(value.status) ? value.status : undefined
  const executionId =
    'executionId' in value && typeof value.executionId === 'string' && value.executionId ? value.executionId : undefined
  const reasoning = 'reasoning' in value && isReasoningList(value.reasoning) ? value.reasoning : undefined
  return { id: value.id, role, content, status, executionId, reasoning }
}

function overlayPreviewMessage(persisted: IChatMessage, frozen: PreviewPauseSnapshotMessage): IChatMessage {
  return {
    ...persisted,
    role: frozen.role,
    ...(frozen.content !== undefined ? { content: frozen.content } : {}),
    ...(frozen.status !== undefined ? { status: frozen.status } : {}),
    ...(frozen.executionId !== undefined ? { executionId: frozen.executionId } : {}),
    ...(frozen.reasoning !== undefined ? { reasoning: frozen.reasoning } : {})
  }
}

function createPreviewMessageFromSnapshot(frozen: PreviewPauseSnapshotMessage): IChatMessage {
  return {
    id: frozen.id,
    role: frozen.role,
    content: frozen.content,
    status: frozen.status,
    executionId: frozen.executionId,
    reasoning: frozen.reasoning
  }
}

export function applyDisplayPauseSnapshot(
  messages: IChatMessage[],
  snapshot: string | null | undefined
): IChatMessage[] {
  const frozenMessages = parsePreviewPauseSnapshot(snapshot)
  if (!frozenMessages) {
    return messages
  }
  const persistedById = new Map(messages.flatMap((message) => (message.id ? [[message.id, message] as const] : [])))
  return frozenMessages.map((frozen) => {
    const persisted = persistedById.get(frozen.id)
    return persisted ? overlayPreviewMessage(persisted, frozen) : createPreviewMessageFromSnapshot(frozen)
  })
}
