import { appendMessageContent, CopilotChatMessage, TMessageContentComponent, TMessageContentComplex } from '../../@core'

type ChatBiTraceData = {
  id?: string
  category: 'Computer' | 'Dashboard'
  [key: string]: unknown
}

export type ChatBiTraceItem = TMessageContentComponent<ChatBiTraceData>

type ChatBiTraceConversation = {
  messages?: Array<{
    id?: string
    role?: string
    content?: unknown
  }>
}

export function extractChatBiTraceItems(conversation?: ChatBiTraceConversation | null): ChatBiTraceItem[] {
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

export function isChatBiTraceComponent(content: TMessageContentComplex | unknown): content is ChatBiTraceItem {
  if (!content || typeof content !== 'object' || !('type' in content) || content.type !== 'component') {
    return false
  }

  if (!('data' in content) || !content.data || typeof content.data !== 'object' || !('category' in content.data)) {
    return false
  }

  const category = content.data.category
  return isChatBiTraceCategory(category)
}

function isChatBiTraceCategory(category: unknown): category is ChatBiTraceData['category'] {
  return category === 'Computer' || category === 'Dashboard'
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

  if (isChatBiTraceComponent(value)) {
    return value
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

  const preferredKeys = ['data', 'item', 'payload', 'content', 'detail', 'message']
  for (const key of preferredKeys) {
    const nested = findTraceComponent(Reflect.get(value, key), visited)
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
