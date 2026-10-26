import type { I18nText } from '@xpert-ai/contracts'

export type SidebarSearchSource =
  | 'automations'
  | 'projects'
  | 'conversations'
  | 'archivedConversations'
  | 'plugins'
  | 'marketplace'
  | 'agentPlugins'
  | 'models'
  | 'publications'
  | 'runtimes'
  | 'targets'
  | 'learning'
  | 'candidates'
  | 'evaluations'
  | 'deployments'
  | 'approvals'

export interface SidebarSearchContext {
  assistantId?: string
  conversationRoute?: string[]
}

export interface SidebarSearchResult {
  id: string
  title: string
  description?: string
  icon: string
  route: string[]
  queryParams?: Record<string, string>
}

export interface SidebarSearchPage {
  items: SidebarSearchResult[]
  total: number
  incomplete?: boolean
}

export const SIDEBAR_SEARCH_PAGE_SIZE = 20

/** Search only explicitly chosen display fields, never serialized credentials or configuration. */
export function matchesSidebarSearch(query: string, ...values: (I18nText | null | undefined)[]): boolean {
  const text = values
    .flatMap((value) => (typeof value === 'string' ? [value] : Object.values(value ?? {})))
    .join(' ')
    .toLocaleLowerCase()
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word))
}

export function searchPage(items: SidebarSearchResult[], offset: number): SidebarSearchPage {
  return { items: items.slice(offset, offset + SIDEBAR_SEARCH_PAGE_SIZE), total: items.length }
}
