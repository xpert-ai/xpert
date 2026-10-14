import type { CatalogItem } from '../catalog-types'

export const templateSources = ['agent-plugin', 'plugin', 'builtin', 'shared', 'other'] as const
export type TemplateSource = (typeof templateSources)[number]
export const templateSourceLabels: Record<TemplateSource, string> = {
  'agent-plugin': 'Agent Plugins',
  plugin: 'Xpert Plugins',
  builtin: 'Built-in templates',
  shared: 'Shared templates',
  other: 'Other sources'
}
export function templateSource(item: CatalogItem): TemplateSource {
  if (item.kind !== 'templates') return 'other'
  switch (item.source) {
    case 'agent-plugin':
    case 'plugin':
    case 'builtin':
    case 'shared':
      return item.source
    default:
      return 'other'
  }
}
export function sortTemplateSources(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort(
    (a, b) => templateSources.indexOf(templateSource(a)) - templateSources.indexOf(templateSource(b))
  )
}
export function templateSourceGroups(items: CatalogItem[]) {
  return templateSources
    .map((source) => ({ source, count: items.filter((item) => templateSource(item) === source).length }))
    .filter((group) => group.count > 0)
}
