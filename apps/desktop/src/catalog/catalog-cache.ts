import type { CatalogItem, CatalogKind } from '../catalog-types'

export type CatalogDataKind = CatalogItem['kind']
export interface CatalogSnapshot {
  items: CatalogItem[]
  loading: boolean
  total?: number
  loadingMore?: boolean
  error: string
}

const empty: CatalogSnapshot = { items: [], loading: true, error: '' }
export function isCatalogDataKind(kind: CatalogKind): kind is CatalogDataKind {
  return kind === 'experts' || kind === 'applications' || kind === 'templates'
}
const separateCatalog: CatalogSnapshot = { items: [], loading: false, error: '' }

type CatalogPage = { items: CatalogItem[]; nextOffset: number | null; total?: number }
type CardImages = { cover?: string; icon?: string; avatar?: string | null }
export type CatalogCache = ReturnType<typeof createCatalogCache>
const freshnessMs = 30_000
export function createCatalogCache(
  fetchItems: (kind: CatalogDataKind) => Promise<CatalogItem[]>,
  fetchTemplatePage?: (offset: number) => Promise<CatalogPage>,
  fetchExpertPage?: (offset: number) => Promise<CatalogPage>
) {
  const entries = new Map<CatalogDataKind, CatalogSnapshot>()
  const refreshed = new Map<CatalogDataKind, number>()
  const artwork = new Map<string, Promise<CardImages>>()
  const requests = new Map<CatalogDataKind, symbol>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  return {
    images(key: string, fetch: () => Promise<CardImages>) {
      const cached = artwork.get(key)
      if (cached) return cached
      const pending = fetch().catch((reason) => {
        if (artwork.get(key) === pending) artwork.delete(key)
        throw reason
      })
      const oldest = artwork.keys().next()
      if (artwork.size >= 160 && !oldest.done) artwork.delete(oldest.value)
      artwork.set(key, pending)
      return pending
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot(kind: CatalogKind): CatalogSnapshot {
      return isCatalogDataKind(kind) ? entries.get(kind) || empty : separateCatalog
    },
    async load(kind: CatalogDataKind, refresh = false) {
      if (
        !refresh &&
        entries.has(kind) &&
        (requests.has(kind) || Date.now() - (refreshed.get(kind) ?? 0) < freshnessMs)
      )
        return
      refreshed.set(kind, Date.now())
      const keepItems = !!entries.get(kind)?.items.length
      const request = Symbol()
      requests.set(kind, request)
      entries.set(kind, { items: entries.get(kind)?.items || [], loading: true, error: '' })
      notify()
      try {
        const fetchPage = kind === 'templates' ? fetchTemplatePage : kind === 'experts' ? fetchExpertPage : undefined
        if (fetchPage) {
          let offset: number | null = 0
          const items: CatalogItem[] = []
          while (offset !== null) {
            const page = await fetchPage(offset)
            if (requests.get(kind) !== request) return
            items.push(...page.items)
            if (page.nextOffset !== null && page.nextOffset <= offset) throw new Error('Invalid catalog pagination.')
            // Initial loads stream pages; a refresh replaces the visible catalog only when complete.
            if (!keepItems || page.nextOffset === null) {
              entries.set(kind, {
                items: [...items],
                ...(page.total !== undefined ? { total: page.total } : {}),
                loading: false,
                loadingMore: page.nextOffset !== null,
                error: ''
              })
              notify()
            }
            offset = page.nextOffset
          }
          return
        }
        const items = await fetchItems(kind)
        if (requests.get(kind) === request) entries.set(kind, { items, loading: false, error: '' })
      } catch (reason) {
        if (requests.get(kind) === request) {
          const denied =
            reason instanceof Error && 'status' in reason && (reason.status === 401 || reason.status === 403)
          if (denied) artwork.clear()
          entries.set(kind, {
            items: denied ? [] : entries.get(kind)?.items || [],
            loading: false,
            error: reason instanceof Error ? reason.message : 'Could not load the catalog.'
          })
        }
      } finally {
        if (requests.get(kind) === request) {
          requests.delete(kind)
          notify()
        }
      }
    },
    update(item: CatalogItem) {
      const entry = entries.get(item.kind)
      if (!entry) return
      requests.delete(item.kind)
      if (entry.loadingMore) refreshed.delete(item.kind)
      entries.set(item.kind, {
        items: entry.items.map((current) => {
          if (current.id !== item.id) return current
          // Detail responses may contain full-resolution artwork. Keep list thumbnails and the catalog's preferred scope.
          if (current.kind === 'applications' && item.kind === 'applications' && current.hasCardImages) {
            return current.installationScope === item.installationScope
              ? { ...current, status: item.status, botId: item.botId, initializationAccess: item.initializationAccess }
              : current
          }
          if (current.kind === 'experts' && item.kind === 'experts' && current.hasCardAvatar)
            return { ...current, access: item.access }
          return item
        }),
        loading: false,
        error: ''
      })
      notify()
    },
    invalidate(kind: CatalogDataKind) {
      requests.delete(kind)
      entries.delete(kind)
      notify()
    }
  }
}
