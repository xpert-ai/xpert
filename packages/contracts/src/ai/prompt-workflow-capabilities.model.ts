import type { RuntimeCapabilitiesSelection, RuntimeCapabilitiesSelectionSet } from '@xpert-ai/chatkit-types'

/** Expert node keys are local to their graph. Resolve this config before sending it to ChatKit. */
export type PromptWorkflowCapabilityConfig = {
  type: 'expert_scoped_capabilities'
  version: 1
  defaults?: RuntimeCapabilitiesSelection | null
  experts: Array<{ xpertId: string; selection: RuntimeCapabilitiesSelection | null }>
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseSelectionSet(value: unknown): RuntimeCapabilitiesSelectionSet | null {
  if (!isObject(value)) return null
  const skills = 'skills' in value ? value.skills : undefined
  const plugins = 'plugins' in value ? value.plugins : undefined
  const subAgents = 'subAgents' in value ? value.subAgents : undefined
  const connectors = 'connectors' in value ? value.connectors : undefined
  if (
    skills !== undefined &&
    (!isObject(skills) ||
      !('ids' in skills) ||
      !isStringList(skills.ids) ||
      ('workspaceId' in skills && skills.workspaceId !== undefined && typeof skills.workspaceId !== 'string'))
  )
    return null
  if (plugins !== undefined && (!isObject(plugins) || !('nodeKeys' in plugins) || !isStringList(plugins.nodeKeys)))
    return null
  if (
    subAgents !== undefined &&
    (!isObject(subAgents) || !('nodeKeys' in subAgents) || !isStringList(subAgents.nodeKeys))
  )
    return null
  if (
    connectors !== undefined &&
    (!isObject(connectors) || !('bindingIds' in connectors) || !isStringList(connectors.bindingIds))
  )
    return null
  return {
    ...value,
    skills: skills === undefined ? { ids: [] } : (skills as RuntimeCapabilitiesSelectionSet['skills']),
    plugins: plugins === undefined ? { nodeKeys: [] } : (plugins as RuntimeCapabilitiesSelectionSet['plugins']),
    ...(subAgents === undefined ? {} : { subAgents: subAgents as RuntimeCapabilitiesSelectionSet['subAgents'] }),
    ...(connectors === undefined ? {} : { connectors: connectors as RuntimeCapabilitiesSelectionSet['connectors'] })
  }
}

export function parsePromptCapabilitySelection(value: unknown): RuntimeCapabilitiesSelection | null {
  if (!isObject(value) || !('mode' in value) || value.mode !== 'allowlist') return null
  if (
    'inheritUnselected' in value &&
    value.inheritUnselected !== undefined &&
    typeof value.inheritUnselected !== 'boolean'
  )
    return null
  const selection = parseSelectionSet(value)
  const recommended =
    'recommended' in value && value.recommended != null ? parseSelectionSet(value.recommended) : undefined
  if (!selection || recommended === null) return null
  return {
    ...selection,
    mode: 'allowlist',
    ...('inheritUnselected' in value && typeof value.inheritUnselected === 'boolean'
      ? { inheritUnselected: value.inheritUnselected }
      : {}),
    ...(recommended ? { recommended } : {})
  }
}

export function isScopedPromptCapabilityConfig(value: unknown): boolean {
  return isObject(value) && 'type' in value && value.type === 'expert_scoped_capabilities'
}

export function parsePromptCapabilityConfig(value: unknown): PromptWorkflowCapabilityConfig | null {
  if (
    !isObject(value) ||
    !('type' in value) ||
    value.type !== 'expert_scoped_capabilities' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('experts' in value) ||
    !Array.isArray(value.experts)
  )
    return null
  const defaults = 'defaults' in value && value.defaults != null ? parsePromptCapabilitySelection(value.defaults) : null
  if ('defaults' in value && value.defaults != null && !defaults) return null
  const experts: PromptWorkflowCapabilityConfig['experts'] = []
  for (const entry of value.experts) {
    if (
      !isObject(entry) ||
      !('xpertId' in entry) ||
      typeof entry.xpertId !== 'string' ||
      !entry.xpertId.trim() ||
      !('selection' in entry) ||
      experts.some((item) => item.xpertId === entry.xpertId)
    )
      return null
    const selection = entry.selection === null ? null : parsePromptCapabilitySelection(entry.selection)
    if (entry.selection !== null && !selection) return null
    experts.push({ xpertId: entry.xpertId, selection })
  }
  return { ...value, type: 'expert_scoped_capabilities', version: 1, defaults, experts }
}

export function resolvePromptWorkflowCapabilities(value: unknown, xpertId?: string): unknown {
  if (!isScopedPromptCapabilityConfig(value)) return value
  const config = parsePromptCapabilityConfig(value)
  if (!config) return null
  const entry = config.experts.find((item) => item.xpertId === xpertId)
  return entry ? entry.selection : config.defaults
}
