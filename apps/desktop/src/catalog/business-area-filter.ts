import type { CatalogItem } from '../catalog-types'

export function catalogBusinessAreas(items: CatalogItem[]) {
  const areas = new Map<string, { id: string; name: string }>()
  for (const item of items) {
    if (item.kind === 'experts' && item.businessArea) areas.set(item.businessArea.id, item.businessArea)
  }
  return [...areas.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function matchesBusinessArea(item: CatalogItem, areaId: string | null) {
  return !areaId || (item.kind === 'experts' && item.businessArea?.id === areaId)
}
