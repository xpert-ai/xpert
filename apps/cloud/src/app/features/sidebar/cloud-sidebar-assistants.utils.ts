import type { IChatConversation, IChatConversationUnreadXpertSummary } from '@xpert-ai/contracts'

export interface AssistantXpertLike {
  id?: string | null
  createdAt?: Date | string | null
  slug?: string | null
  name?: string | null
  title?: string | null
  titleCN?: string | null
  description?: string | null
  latest?: boolean | null
  businessAreaId?: string | null
  businessArea?: { id?: string | null; name?: string | null } | null
  tags?: Array<{ name?: unknown; label?: unknown }>
}

export type AssistantBusinessArea = {
  id: string
  name: string
}

export function normalizeAssistantXperts<T extends AssistantXpertLike>(
  items: T[] | { items?: T[] } | null | undefined
) {
  const seen = new Set<string>()
  const candidates = Array.isArray(items) ? items : Array.isArray(items?.items) ? items.items : []

  return candidates.filter((xpert): xpert is T => {
    if (!xpert?.id || xpert.latest === false || seen.has(xpert.id)) {
      return false
    }

    seen.add(xpert.id)
    return true
  })
}

export function filterAssistantXperts<T extends AssistantXpertLike>(items: T[], query: string, category = 'all') {
  const keyword = query.trim().toLowerCase()

  return items.filter((xpert) => {
    const matchesCategory = category === 'all' || assistantMatchesTag(xpert, category)
    const matchesKeyword = !keyword || getAssistantSearchText(xpert).toLowerCase().includes(keyword)

    return matchesCategory && matchesKeyword
  })
}

export function orderAssistantXperts<T extends AssistantXpertLike>(items: T[], orderedIds: string[]) {
  const itemById = new Map(
    items
      .filter((item): item is T & { id: string } => typeof item.id === 'string' && !!item.id.trim())
      .map((item) => [item.id, item] as const)
  )
  const orderedIdSet = new Set(orderedIds)
  const unorderedItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.id || !orderedIdSet.has(item.id))
    .sort((left, right) => {
      const leftCreatedAt = getAssistantCreatedAtTimestamp(left.item)
      const rightCreatedAt = getAssistantCreatedAtTimestamp(right.item)

      return leftCreatedAt === rightCreatedAt ? left.index - right.index : rightCreatedAt > leftCreatedAt ? 1 : -1
    })
    .map(({ item }) => item)

  return [
    ...unorderedItems,
    ...orderedIds.map((id) => itemById.get(id)).filter((item): item is T & { id: string } => !!item)
  ]
}

function getAssistantCreatedAtTimestamp(xpert: AssistantXpertLike) {
  const value = xpert.createdAt
  const timestamp = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : Number.NaN

  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

export function getAssistantRouteId(xpert: AssistantXpertLike) {
  return xpert.slug || xpert.id || ''
}

export function getAssistantLabel(xpert: AssistantXpertLike) {
  const label = getAssistantName(xpert)
  const businessAreaName = getAssistantBusinessAreaName(xpert)

  return businessAreaName && label ? `${businessAreaName} / ${label}` : label
}

export function getAssistantName(xpert: AssistantXpertLike) {
  return xpert.title || xpert.titleCN || xpert.name || xpert.slug || xpert.id || ''
}

export function getAssistantBusinessAreaName(xpert: AssistantXpertLike) {
  return xpert.businessArea?.name?.trim() || ''
}

export function getAssistantBusinessArea(xpert: AssistantXpertLike): AssistantBusinessArea | null {
  const id = xpert.businessAreaId?.trim() || xpert.businessArea?.id?.trim()
  const name = getAssistantBusinessAreaName(xpert)

  return id && name ? { id, name } : null
}

export function getAssistantBusinessAreaInitial(name: string) {
  return Array.from(name.trim())[0] ?? ''
}

export function getAssistantDescription(xpert: AssistantXpertLike) {
  const description = xpert.description?.trim()
  if (description) {
    return description
  }

  return xpert.name || xpert.slug || xpert.id || ''
}

export function isAssistantRouteActive(url: string, xpert: AssistantXpertLike) {
  const routeId = getAssistantRouteId(xpert)

  return !!routeId && normalizeChatPath(url).startsWith(`/chat/x/${encodeURIComponent(routeId)}/c`)
}

function assistantMatchesTag(xpert: AssistantXpertLike, tagName: string) {
  const normalizedTagName = normalizeAssistantTagValue(tagName)
  return getAssistantTagNames(xpert).some((tag) => normalizeAssistantTagValue(tag) === normalizedTagName)
}

function getAssistantSearchText(xpert: AssistantXpertLike) {
  return [getAssistantLabel(xpert), getAssistantDescription(xpert), xpert.slug, ...getAssistantTagNames(xpert)]
    .filter(Boolean)
    .join(' ')
}

export function getAssistantTagNames(xpert: AssistantXpertLike) {
  return (
    xpert.tags?.map((tag) => tag.name).filter((name): name is string => typeof name === 'string' && !!name.trim()) ?? []
  )
}

function normalizeAssistantTagValue(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeChatPath(url: string) {
  const [pathname] = (url || '/chat').split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

export function viewKeysMatch(menuViewKey: string, currentViewKey: string | null | undefined) {
  const normalizedMenuViewKey = menuViewKey.trim()
  const normalizedCurrentViewKey = currentViewKey?.trim()

  if (!normalizedMenuViewKey || !normalizedCurrentViewKey) {
    return false
  }

  return (
    normalizedMenuViewKey === normalizedCurrentViewKey ||
    normalizedMenuViewKey.endsWith(`__${normalizedCurrentViewKey}`) ||
    normalizedCurrentViewKey.endsWith(`__${normalizedMenuViewKey}`)
  )
}

export function normalizeUnreadSummaries(value: unknown): IChatConversationUnreadXpertSummary[] {
  if (Array.isArray(value)) {
    return value.filter(isUnreadSummary)
  }

  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: unknown[] }).items.filter(isUnreadSummary)
  }

  return []
}

export function mergeConversations(current: IChatConversation[], incoming: IChatConversation[]) {
  const conversations = new Map<string, IChatConversation>()

  for (const conversation of [...current, ...incoming]) {
    const key = conversation.id?.trim() || conversation.threadId?.trim()
    if (key) {
      conversations.set(key, conversation)
    }
  }

  return Array.from(conversations.values()).sort(
    (left, right) =>
      Number(!!right.sidebar?.pinned) - Number(!!left.sidebar?.pinned) ||
      toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt)
  )
}

function toTimestamp(value: Date | string | number | null | undefined) {
  const timestamp = value instanceof Date ? value.getTime() : value ? new Date(value).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function formatConversationUpdatedAt(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}`
}

function isUnreadSummary(value: unknown): value is IChatConversationUnreadXpertSummary {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as IChatConversationUnreadXpertSummary).xpertId === 'string' &&
    typeof (value as IChatConversationUnreadXpertSummary).unreadMessages === 'number'
  )
}

export function readAssistantOrder(storageKey: string) {
  const storage = getLocalStorage()
  if (!storage) {
    return []
  }

  let value: unknown
  try {
    const storedValue = storage.getItem(storageKey)
    value = storedValue ? JSON.parse(storedValue) : []
  } catch {
    return []
  }

  if (!Array.isArray(value)) {
    return []
  }

  const orderedIds = value.filter((id): id is string => typeof id === 'string' && !!id.trim()).map((id) => id.trim())

  return Array.from(new Set(orderedIds))
}

export function writeAssistantOrder(storageKey: string, orderedIds: string[]) {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(storageKey, JSON.stringify(orderedIds))
  } catch {
    return
  }
}

function getLocalStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
