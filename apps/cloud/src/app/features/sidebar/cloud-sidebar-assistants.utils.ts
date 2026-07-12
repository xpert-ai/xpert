export interface AssistantXpertLike {
  id?: string | null
  createdAt?: Date | string | null
  slug?: string | null
  name?: string | null
  title?: string | null
  titleCN?: string | null
  description?: string | null
  latest?: boolean | null
  tags?: Array<{ name?: unknown; label?: unknown }>
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
  return xpert.title || xpert.titleCN || xpert.name || xpert.slug || xpert.id || ''
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

function normalizeChatPath(url: string) {
  const [pathname] = (url || '/chat').split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}
