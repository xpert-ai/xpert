export interface AssistantXpertLike {
  id?: string | null
  slug?: string | null
  name?: string | null
  title?: string | null
  titleCN?: string | null
  description?: string | null
  latest?: boolean | null
  tags?: Array<{ name?: unknown; label?: unknown }>
}

export type AssistantCategory = 'all' | 'office' | 'data' | 'mcp' | 'personal'

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

export function filterAssistantXperts<T extends AssistantXpertLike>(
  items: T[],
  query: string,
  category: AssistantCategory = 'all'
) {
  const keyword = query.trim().toLowerCase()

  return items.filter(
    (xpert) =>
      (category === 'all' || assistantMatchesCategory(xpert, category)) &&
      (!keyword || getAssistantSearchText(xpert).toLowerCase().includes(keyword))
  )
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

export function assistantMatchesCategory(xpert: AssistantXpertLike, category: AssistantCategory) {
  const text = getAssistantSearchText(xpert).toLowerCase()

  switch (category) {
    case 'office':
      return /office|docx|word|sheet|excel|ppt|presentation|document|文档|表格|演示/.test(text)
    case 'data':
      return /data|bi|chart|echarts|semantic|ontology|model|数据|图表|指标|模型/.test(text)
    case 'mcp':
      return /mcp|tool|tools|toolset|工具/.test(text)
    case 'personal':
      return /personal|wechat|微信|个人|crm|客户/.test(text)
    default:
      return true
  }
}

function getAssistantSearchText(xpert: AssistantXpertLike) {
  return [
    getAssistantLabel(xpert),
    getAssistantDescription(xpert),
    xpert.slug,
    ...(xpert.tags?.map((tag) => stringifyAssistantTagValue(tag.name) || stringifyAssistantTagValue(tag.label)) ?? [])
  ]
    .filter(Boolean)
    .join(' ')
}

function stringifyAssistantTagValue(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (!value || typeof value !== 'object') {
    return ''
  }

  return Object.values(value as Record<string, unknown>)
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
}

function normalizeChatPath(url: string) {
  const [pathname] = (url || '/chat').split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}
