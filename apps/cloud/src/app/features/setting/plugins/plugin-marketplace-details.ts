import type { I18nObject } from '@xpert-ai/contracts'
import { mergeMarketplaceContributions } from './plugin-marketplace-metadata'
import { TInstalledPlugin, TPluginMarketplaceContribution, TPluginWithDownloads } from './types'

export function toPluginMarketplaceDetails(plugin: TInstalledPlugin): TPluginWithDownloads {
  const contributions = getInstalledPluginMarketplaceContributions(plugin)
  return {
    name: plugin.packageName ?? plugin.name,
    packageName: plugin.packageName ?? plugin.name,
    displayName: normalizePluginDisplayText(plugin.meta.displayName, plugin.name),
    description: normalizePluginDisplayText(plugin.meta.description, plugin.name),
    version: plugin.currentVersion ?? plugin.meta.version ?? '',
    artifactNamespace: plugin.meta.artifactNamespace ?? null,
    level: plugin.level ?? plugin.meta.level,
    deprecated: plugin.meta.deprecated,
    deprecationMessage: plugin.meta.deprecationMessage,
    category: plugin.meta.category ?? 'integration',
    icon: plugin.meta.icon ?? {
      type: 'font',
      value: 'ri-puzzle-2-line'
    },
    author: {
      name: plugin.meta.author ?? 'XpertAI',
      url: plugin.meta.homepage ?? ''
    },
    source: plugin.meta.homepage
      ? {
          type: 'website',
          url: plugin.meta.homepage
        }
      : undefined,
    keywords: plugin.meta.keywords,
    installed: plugin.loadStatus !== 'failed',
    contributions,
    operationSummary: countMarketplaceOperations(contributions),
    targetAppMeta: plugin.meta.targetAppMeta
  }
}

export function getInstalledPluginMarketplaceContributions(plugin: TInstalledPlugin): TPluginMarketplaceContribution[] {
  const targetAppMeta = plugin.meta.targetAppMeta
  if (!targetAppMeta) {
    return []
  }

  return mergeMarketplaceContributions(
    ...Object.values(targetAppMeta).map((metadata) => metadata?.marketplace?.contents)
  ).filter((content): content is TPluginMarketplaceContribution => !!content?.name && !!content?.type)
}

function countMarketplaceOperations(
  contributions: TPluginMarketplaceContribution[]
): TPluginWithDownloads['operationSummary'] {
  const operations = contributions.flatMap((content) => (Array.isArray(content.operations) ? content.operations : []))
  return {
    total: operations.length,
    read: operations.filter((operation) => operation.access === 'read').length,
    write: operations.filter((operation) => operation.access === 'write').length,
    admin: operations.filter((operation) => operation.access === 'admin').length
  }
}

function normalizePluginDisplayText(value: unknown, fallback: string): TPluginWithDownloads['displayName'] {
  if (typeof value === 'string') {
    return value
  }

  if (isI18nObject(value)) {
    return value
  }

  return fallback
}

function isI18nObject(value: unknown): value is I18nObject {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const enUS = Reflect.get(value, 'en_US')
  const zhHans = Reflect.get(value, 'zh_Hans')
  return typeof enUS === 'string' && (zhHans === undefined || typeof zhHans === 'string')
}
