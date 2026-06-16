import { IPluginDescriptor } from '@xpert-ai/cloud/state'
import {
  PluginMarketplaceItem,
  PluginMarketplaceContribution,
  PluginTargetAppMarketplaceMetadata,
  PluginTargetAppMeta,
  PluginTargetAppMetadata
} from '@xpert-ai/contracts'

export function buildMarketplacePluginMetadataLookup(items: readonly PluginMarketplaceItem[]) {
  const lookup = new Map<string, PluginMarketplaceItem>()

  for (const item of items) {
    addMarketplacePluginMetadataLookupKey(lookup, item.name, item)
    addMarketplacePluginMetadataLookupKey(lookup, item.packageName, item)
  }

  return lookup
}

export function enrichInstalledPluginWithMarketplaceMetadata<T extends IPluginDescriptor>(
  plugin: T,
  marketplacePluginsByName: ReadonlyMap<string, PluginMarketplaceItem>
): T {
  const marketplacePlugin = findMarketplacePluginForInstalledPlugin(plugin, marketplacePluginsByName)
  const targetAppMeta = mergeInstalledPluginTargetAppMeta(marketplacePlugin?.targetAppMeta, plugin.meta.targetAppMeta)

  if (!targetAppMeta) {
    return plugin
  }

  return {
    ...plugin,
    meta: {
      ...plugin.meta,
      targetAppMeta
    }
  }
}

function addMarketplacePluginMetadataLookupKey(
  lookup: Map<string, PluginMarketplaceItem>,
  value: unknown,
  item: PluginMarketplaceItem
) {
  const key = normalizePluginLookupKey(value)
  if (key && !lookup.has(key)) {
    lookup.set(key, item)
  }
}

function findMarketplacePluginForInstalledPlugin(
  plugin: IPluginDescriptor,
  lookup: ReadonlyMap<string, PluginMarketplaceItem>
) {
  const keys = [plugin.packageName, plugin.meta.name, plugin.name]
    .map((value) => normalizePluginLookupKey(value))
    .filter((value): value is string => !!value)

  for (const key of keys) {
    const item = lookup.get(key)
    if (item) {
      return item
    }
  }

  return null
}

function normalizePluginLookupKey(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null
}

function mergeInstalledPluginTargetAppMeta(
  marketplaceMeta?: PluginTargetAppMeta | null,
  installedMeta?: PluginTargetAppMeta | null
): PluginTargetAppMeta | undefined {
  const keys = uniqueStrings([...Object.keys(marketplaceMeta ?? {}), ...Object.keys(installedMeta ?? {})])

  if (!keys.length) {
    return undefined
  }

  const merged: PluginTargetAppMeta = {}
  for (const key of keys) {
    const marketplaceEntry = marketplaceMeta?.[key] ?? {}
    const installedEntry = installedMeta?.[key] ?? {}
    merged[key] = mergeInstalledPluginTargetAppMetadata(marketplaceEntry, installedEntry)
  }

  return merged
}

function mergeInstalledPluginTargetAppMetadata(
  marketplaceEntry: PluginTargetAppMetadata,
  installedEntry: PluginTargetAppMetadata
): PluginTargetAppMetadata {
  const types = uniqueStrings([...(marketplaceEntry.types ?? []), ...(installedEntry.types ?? [])])
  const capabilities = uniqueStrings([...(marketplaceEntry.capabilities ?? []), ...(installedEntry.capabilities ?? [])])
  const runtime = {
    ...(marketplaceEntry.runtime ?? {}),
    ...(installedEntry.runtime ?? {})
  }
  const marketplace = mergeInstalledPluginMarketplaceMetadata(marketplaceEntry.marketplace, installedEntry.marketplace)
  const merged: PluginTargetAppMetadata = {
    ...marketplaceEntry,
    ...installedEntry
  }

  if (types.length) {
    merged.types = types
  }
  if (capabilities.length) {
    merged.capabilities = capabilities
  }
  if (Object.keys(runtime).length) {
    merged.runtime = runtime
  }
  if (marketplace) {
    merged.marketplace = marketplace
  }

  return merged
}

function mergeInstalledPluginMarketplaceMetadata(
  marketplace?: PluginTargetAppMarketplaceMetadata,
  installed?: PluginTargetAppMarketplaceMetadata
): PluginTargetAppMarketplaceMetadata | undefined {
  const contents = mergeMarketplaceContributions(marketplace?.contents, installed?.contents)
  const merged: PluginTargetAppMarketplaceMetadata = {
    ...(marketplace ?? {}),
    ...(installed ?? {})
  }

  if (contents.length) {
    merged.contents = contents
  }

  return Object.keys(merged).length ? merged : undefined
}

function mergeMarketplaceContributions(
  ...groups: Array<readonly PluginMarketplaceContribution[] | undefined>
): PluginMarketplaceContribution[] {
  const byKey = new Map<string, PluginMarketplaceContribution>()

  for (const group of groups) {
    if (!group) {
      continue
    }

    for (const contribution of group) {
      const key = `${contribution.type}:${contribution.id ?? contribution.name}`
      byKey.set(key, {
        ...(byKey.get(key) ?? {}),
        ...contribution
      })
    }
  }

  return Array.from(byKey.values())
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}
