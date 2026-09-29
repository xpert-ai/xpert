import type { I18nObject, TAgentMiddlewareMeta, XpertExtensionViewManifest } from '@xpert-ai/contracts'

export interface MiddlewareFeatureItem {
  key: string
  label?: I18nObject
  views: Pick<XpertExtensionViewManifest, 'key' | 'title'>[]
}

export function middlewareFeatureItems(
  meta: TAgentMiddlewareMeta | undefined,
  views: readonly Pick<XpertExtensionViewManifest, 'key' | 'title' | 'visible' | 'activation' | 'workbench'>[]
): MiddlewareFeatureItem[] {
  // Feature associations include Agent-only views; menu visibility is independent.
  const visibleViews = [
    ...new Map(views.filter((view) => view.visible !== false).map((view) => [view.key, view])).values()
  ]
  return [...new Set((meta?.features ?? []).map((key) => key.trim()).filter(Boolean))].map((key) => ({
    key,
    label: meta?.featureLabels?.[key],
    views: visibleViews
      .filter((view) => view.activation?.requiredFeatures?.includes(key))
      .map((view) => ({ key: view.key, title: view.title }))
  }))
}
