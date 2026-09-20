import type { IconDefinition, I18nObject, XpertExtensionViewManifest, XpertViewQuery } from '@xpert-ai/contracts'
import type { ClawXpertFixedViewTab } from '../../clawxpert-fixed-view-stack.component'

export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const DEFAULT_FIXED_VIEW_ICON = {
  type: 'font',
  value: 'ri-layout-grid-line',
  alt: 'Fixed view'
} satisfies IconDefinition

export type ClawXpertFixedViewMenuItem = {
  viewKey: string
  title: string
  description: string | null
  icon: IconDefinition | null
  order: number
}

export function shouldShowFixedViewInMenu(manifest: XpertExtensionViewManifest) {
  if (manifest.visible === false) {
    return false
  }
  if (manifest.workbench?.fixed === false) {
    return false
  }
  return manifest.workbench?.menu?.enabled !== false
}

export function findFixedViewTab(tabs: ClawXpertFixedViewTab[], viewKey: string | null | undefined) {
  return findResolvedViewByKey(tabs, viewKey)
}

export function findResolvedViewByKey<T extends { viewKey: string }>(items: T[], viewKey: string | null | undefined) {
  const normalizedViewKey = viewKey?.trim()
  if (!normalizedViewKey) {
    return undefined
  }

  const exact = items.find((item) => item.viewKey === normalizedViewKey)
  if (exact) {
    return exact
  }

  const aliases = items.filter((item) => item.viewKey.endsWith(`__${normalizedViewKey}`))
  return aliases.length === 1 ? aliases[0] : undefined
}

export function resolveI18nText(
  value: string | I18nObject | null | undefined,
  fallback: string,
  language?: string | null
) {
  if (typeof value === 'string') {
    return value.trim() || fallback
  }
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const normalizedLanguage = (language ?? '').toLowerCase()
  const preferredKeys =
    normalizedLanguage.includes('hant') || normalizedLanguage.includes('tw')
      ? ['zh_Hant', 'zh_Hans', 'en_US']
      : normalizedLanguage.startsWith('zh')
        ? ['zh_Hans', 'zh_Hant', 'en_US']
        : ['en_US', 'zh_Hans', 'zh_Hant']

  for (const key of preferredKeys) {
    const text = Reflect.get(value, key)
    if (typeof text === 'string' && text.trim()) {
      return text.trim()
    }
  }

  for (const text of Object.values(value)) {
    if (typeof text === 'string' && text.trim()) {
      return text.trim()
    }
  }

  return fallback
}

export function equalViewQuery(left: XpertViewQuery | null, right: XpertViewQuery | null) {
  return JSON.stringify(left) === JSON.stringify(right)
}
