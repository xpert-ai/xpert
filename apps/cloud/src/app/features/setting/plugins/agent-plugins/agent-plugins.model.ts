import type { AgentPluginDiagnostic, AgentPluginXpertExtension, RuntimeResourceBindingInput } from '@xpert-ai/contracts'

export interface PackageSummary {
  id: string
  digest: string
  createdAt?: string
  source?: { kind: 'git' | 'zip'; url?: string; ref?: string; subdirectory?: string }
  descriptor: {
    name: string
    version?: string
    description?: string
    diagnostics: AgentPluginDiagnostic[]
    skills: Array<{ key: string }>
    servers: Array<{ key: string }>
    extension?: AgentPluginXpertExtension
  }
}

export interface BindingSummary extends RuntimeResourceBindingInput {
  id: string
  version: string
  enabled: boolean
  supersededById?: string
}

export type PluginBinding = BindingSummary & {
  definition: Extract<RuntimeResourceBindingInput['definition'], { kind: 'agent_plugin' }>
}
export type PluginStatus = 'published' | 'unpublished' | 'disabled'
export interface PluginGroup {
  name: string
  title: string
  description: string
  icon?: string
  packages: PackageSummary[]
  bindings: PluginBinding[]
  currentBindings: PluginBinding[]
  displayPackage: PackageSummary
  publishedVersions: string[]
  workspaceIds: string[]
  status: PluginStatus
}

export function packageTitle(pkg: PackageSummary): string {
  return pkg.descriptor.extension?.interface?.displayName || pkg.descriptor.name
}

export function packageDescription(pkg: PackageSummary): string {
  return pkg.descriptor.extension?.interface?.description || pkg.descriptor.description || ''
}

export function packageVersion(pkg: PackageSummary): string {
  return pkg.descriptor.version || pkg.digest.slice(0, 8)
}

// The manifest name is the package identity; display titles and version labels are not identifiers.
// Input order is newest import/binding first, as returned by the admin API.
export function groupPluginPackages(packages: PackageSummary[], bindings: BindingSummary[]): PluginGroup[] {
  const groups = new Map<string, PackageSummary[]>()
  for (const pkg of packages) {
    const versions = groups.get(pkg.descriptor.name) ?? []
    versions.push(pkg)
    groups.set(pkg.descriptor.name, versions)
  }
  return [...groups.entries()].map(([name, versions]) => {
    const ids = new Set(versions.map((pkg) => pkg.id))
    const matches = bindings.filter(
      (binding): binding is PluginBinding =>
        binding.definition.kind === 'agent_plugin' && ids.has(binding.definition.packageId)
    )
    const currentBindings = matches.filter((binding) => !binding.supersededById)
    const enabled = currentBindings.filter((binding) => binding.enabled)
    const current = enabled[0] ?? currentBindings[0]
    const displayPackage = versions.find((pkg) => pkg.id === current?.definition.packageId) ?? versions[0]
    return {
      name,
      title: packageTitle(versions[0]),
      description: packageDescription(versions[0]),
      icon: versions[0].descriptor.extension?.interface?.icon,
      packages: versions,
      bindings: matches,
      currentBindings,
      displayPackage,
      publishedVersions: [...new Set(enabled.map((binding) => binding.definition.packageId))],
      workspaceIds: [...new Set(enabled.flatMap((binding) => binding.workspaceIds))],
      status: enabled.length ? 'published' : currentBindings.length ? 'disabled' : 'unpublished'
    }
  })
}
