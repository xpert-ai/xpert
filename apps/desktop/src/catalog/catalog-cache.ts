import type { CatalogItem, CatalogKind } from '../catalog-types'

export type CatalogDataKind = Exclude<CatalogKind, 'plugins'>
export interface CatalogSnapshot {
  items: CatalogItem[]
  loading: boolean
  error: string
}

const empty: CatalogSnapshot = { items: [], loading: true, error: '' }
const plugins: CatalogSnapshot = { items: [], loading: false, error: '' }

// Each Dialog owns its cache; the host remounts it when the account or organization changes.
export function createCatalogCache(fetchItems: (kind: CatalogDataKind) => Promise<CatalogItem[]>) {
  const entries = new Map<CatalogDataKind, CatalogSnapshot>()
  const requests = new Map<CatalogDataKind, symbol>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot(kind: CatalogKind): CatalogSnapshot {
      return kind === 'plugins' ? plugins : entries.get(kind) || empty
    },
    async load(kind: CatalogDataKind, refresh = false) {
      if (!refresh && entries.has(kind)) return
      const request = Symbol()
      requests.set(kind, request)
      entries.set(kind, { items: entries.get(kind)?.items || [], loading: true, error: '' })
      notify()
      try {
        const items = await fetchItems(kind)
        if (requests.get(kind) === request) entries.set(kind, { items, loading: false, error: '' })
      } catch (reason) {
        if (requests.get(kind) === request)
          entries.set(kind, {
            items: entries.get(kind)?.items || [],
            loading: false,
            error: reason instanceof Error ? reason.message : 'Could not load the catalog.'
          })
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
      entries.set(item.kind, {
        items: entry.items.map((current) => (current.id === item.id ? item : current)),
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
