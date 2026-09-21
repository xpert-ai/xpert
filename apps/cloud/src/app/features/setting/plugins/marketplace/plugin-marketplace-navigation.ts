export function pluginMarketplaceDetailCommands(pluginName: string, basePath = '/plugins') {
  const parts = pluginMarketplaceRouteParts(pluginName)
  return [`${basePath}/marketplace`, ...parts]
}

export function pluginMarketplaceRouteParts(pluginName: string) {
  const normalized = pluginName.trim()
  if (!normalized) {
    return []
  }

  if (normalized.startsWith('@')) {
    const [scope, packageName] = normalized.slice(1).split('/', 2)
    return [scope, packageName].filter(Boolean)
  }

  return [normalized]
}

export function pluginNameFromMarketplaceRoute(scope: string | null, packageName: string | null) {
  if (scope && packageName) {
    return `@${scope}/${packageName}`
  }
  return packageName ?? scope ?? ''
}
