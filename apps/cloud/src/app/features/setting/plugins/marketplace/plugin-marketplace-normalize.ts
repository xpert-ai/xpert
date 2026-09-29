import type { PluginMarketplaceItem } from '@xpert-ai/contracts'
import type { TPlugin } from '@cloud/app/@shared/plugins'
import { getPluginMarketplaceSourceI18nKey, TPluginWithDownloads } from '../types'
import { mergeMarketplaceContributions } from './plugin-marketplace-metadata'

export function normalizeMarketplacePlugin(item: PluginMarketplaceItem): TPluginWithDownloads {
  const name = item.name || item.packageName || ''
  const packageName = item.packageName ?? name
  const sourceId = item.sourceId ?? null
  const sourceName = item.sourceName ?? null

  return {
    summary: item.summary,
    iconAsset: item.iconAsset,
    name,
    packageName,
    displayName: item.displayName ?? name,
    description: item.description ?? name,
    version: item.version ?? '',
    artifactNamespace: item.artifactNamespace ?? null,
    level: item.level,
    deprecated: item.deprecated,
    deprecationMessage: item.deprecationMessage ?? undefined,
    category: item.category ?? 'integration',
    icon: normalizeIcon(item.icon),
    author: normalizeAuthor(item.author),
    source: normalizeSource(item.source),
    keywords: item.keywords,
    downloads: item.downloads,
    sourceId,
    sourceName,
    sourceNameI18nKey: item.sourceNameI18nKey ?? getPluginMarketplaceSourceI18nKey(sourceId, sourceName),
    installed: item.installed,
    screenshots: item.screenshots,
    contributions: mergeMarketplaceContributions(item.contributions),
    defaultPrompt: item.defaultPrompt,
    trialShortcuts: item.trialShortcuts,
    operationSummary: item.operationSummary,
    targetAppMeta: item.targetAppMeta ?? null
  }
}

function normalizeAuthor(value: PluginMarketplaceItem['author']): TPlugin['author'] {
  if (typeof value === 'string') {
    return {
      name: value,
      url: ''
    }
  }

  return {
    name: value?.name ?? value?.displayName ?? 'XpertAI',
    url: value?.url ?? value?.homepage ?? ''
  }
}

function normalizeIcon(value: PluginMarketplaceItem['icon']): TPlugin['icon'] {
  if (value) {
    return value
  }

  return {
    type: 'font',
    value: 'ri-puzzle-2-line'
  }
}

function normalizeSource(value: PluginMarketplaceItem['source']): TPlugin['source'] {
  if (!value?.url) {
    return undefined
  }
  return {
    type: normalizeSourceType(value.type),
    url: value.url
  }
}

function normalizeSourceType(type: string | undefined): NonNullable<TPlugin['source']>['type'] {
  if (
    type === 'marketplace' ||
    type === 'github' ||
    type === 'git' ||
    type === 'url' ||
    type === 'npm' ||
    type === 'website'
  ) {
    return type
  }
  return 'other'
}
