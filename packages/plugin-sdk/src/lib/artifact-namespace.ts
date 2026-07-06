const ARTIFACT_NAMESPACE_PATTERN = /^[a-z0-9_]+$/

function normalizeArtifactSegment(value: string) {
  return value
    .trim()
    .replace(/^@[^/]+\//, '')
    .replace(/^plugin[-_]/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

/**
 * Derive the v1 default artifact namespace from an npm package name.
 * Explicit `artifactNamespace` should stay stable after publish; this fallback is for compatibility.
 */
export function derivePluginArtifactNamespace(packageName: string) {
  const namespace = normalizeArtifactSegment(packageName)
  assertPluginArtifactNamePart(namespace, 'artifact namespace')
  return namespace
}

/**
 * Build the physical table name for a plugin-owned database table.
 * Keep table keys stable; the returned name is part of the plugin data contract.
 */
export function pluginArtifactTableName(namespace: string, tableKey: string) {
  const normalizedNamespace = namespace.trim()
  const normalizedTableKey = tableKey.trim()
  assertPluginArtifactNamePart(normalizedNamespace, 'artifact namespace')
  assertPluginArtifactNamePart(normalizedTableKey, 'artifact table key')
  return `plugin_${normalizedNamespace}_${normalizedTableKey}`
}

function assertPluginArtifactNamePart(value: string, label: string) {
  if (!value || !ARTIFACT_NAMESPACE_PATTERN.test(value)) {
    throw new Error(`${label} must contain only lowercase letters, numbers, and underscores`)
  }
}
