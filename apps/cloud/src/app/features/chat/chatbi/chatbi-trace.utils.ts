import {
  appendMessageContent,
  CopilotChatMessage,
  IChatConversation,
  TMessageContentComponent,
  TMessageContentComplex
} from '../../../@core'

const CHATBI_TRACE_CATEGORIES = new Set(['Computer', 'Dashboard'])

export type ChatBiTraceItem = TMessageContentComponent<any>

export function extractChatBiTraceItems(
  conversation?: Pick<IChatConversation, 'messages'> | null
): ChatBiTraceItem[] {
  return mergeChatBiTraceItems(
    (conversation?.messages ?? []).flatMap((message, messageIndex) => {
      if (message.role !== 'ai' || !Array.isArray(message.content)) {
        return []
      }

      return message.content
        .filter(isChatBiTraceComponent)
        .map((content, contentIndex) =>
          normalizeTraceItem(content, buildTraceKey(content, message.id, messageIndex, contentIndex))
        )
    })
  )
}

export function mergeChatBiTraceItems(items: ReadonlyArray<ChatBiTraceItem | null | undefined>) {
  const mergedMessage = {
    role: 'assistant',
    content: []
  } as CopilotChatMessage

  items.forEach((item, index) => {
    if (!isChatBiTraceComponent(item)) {
      return
    }

    appendMessageContent(mergedMessage, normalizeTraceItem(item, buildTraceKey(item, undefined, 0, index)))
  })

  if (!Array.isArray(mergedMessage.content)) {
    return []
  }

  return mergedMessage.content.filter(isChatBiTraceComponent)
}

export function extractChatBiTraceItemFromLogEvent(event: unknown): ChatBiTraceItem | null {
  const component = resolveTraceComponentFromLogEvent(event)
  if (!component) {
    return null
  }

  return normalizeTraceItem(component, buildTraceKey(component, 'log', 0, 0))
}

export function isChatBiTraceComponent(
  content: TMessageContentComplex | undefined | null
): content is ChatBiTraceItem {
  return !!content && content.type === 'component' && CHATBI_TRACE_CATEGORIES.has(content.data?.category)
}

function resolveTraceComponentFromLogEvent(event: unknown): ChatBiTraceItem | null {
  return findTraceComponent(event, new Set())
}

function findTraceComponent(value: unknown, visited: Set<unknown>): ChatBiTraceItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  if (visited.has(value)) {
    return null
  }
  visited.add(value)

  if (isChatBiTraceComponent(value as TMessageContentComplex)) {
    return value as ChatBiTraceItem
  }

  if (Array.isArray(value)) {
    const tuplePayload = value.length >= 2 && value[0] === 'log' ? findTraceComponent(value[1], visited) : null
    if (tuplePayload) {
      return tuplePayload
    }

    for (const item of value) {
      const nested = findTraceComponent(item, visited)
      if (nested) {
        return nested
      }
    }

    return null
  }

  const record = value as Record<string, unknown>
  const preferredKeys = ['data', 'item', 'payload', 'content', 'detail', 'message']
  for (const key of preferredKeys) {
    const nested = findTraceComponent(record[key], visited)
    if (nested) {
      return nested
    }
  }

  return null
}

function normalizeTraceItem(content: ChatBiTraceItem, key: string): ChatBiTraceItem {
  return {
    ...content,
    id: key,
    data: {
      ...content.data,
      id: key
    }
  }
}

function buildTraceKey(
  content: ChatBiTraceItem,
  messageId: string | undefined,
  messageIndex: number,
  contentIndex: number
) {
  const id = content.id ?? content.data?.id
  if (typeof id === 'string' && id.trim()) {
    return id
  }

  return `${messageId ?? `message-${messageIndex}`}:${contentIndex}`
}
