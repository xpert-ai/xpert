import {
  parsePromptCapabilityConfig,
  parsePromptCapabilitySelection,
  resolvePromptWorkflowCapabilities,
  type PromptWorkflowCapabilityConfig,
  type RuntimeCapabilitiesSelection,
  type RuntimeCapabilitiesSelectionSet
} from '@xpert-ai/contracts'
import { resolveLocalizedText } from '@xpert-ai/chatkit-types'
import type { ConnectorRuntimeOptions } from '@xpert-ai/plugin-sdk'
import type { IAiAssistantRuntimeCapabilities } from '../../../../@core/services/ai-assistant.service'

export type PromptCapabilityKind = 'skill' | 'plugin' | 'subAgent' | 'connector'
export type PromptCapabilityOption = {
  kind: PromptCapabilityKind
  id: string
  label: string
  description?: string
  unavailable?: 'authorization' | 'connection'
}
export const PROMPT_CAPABILITY_KINDS: PromptCapabilityKind[] = ['skill', 'plugin', 'subAgent', 'connector']

export function capabilityIds(
  selection: RuntimeCapabilitiesSelectionSet | null | undefined,
  kind: PromptCapabilityKind
): string[] {
  if (!selection) return []
  switch (kind) {
    case 'skill':
      return selection.skills.ids
    case 'plugin':
      return selection.plugins.nodeKeys
    case 'subAgent':
      return selection.subAgents?.nodeKeys ?? []
    case 'connector':
      return selection.connectors?.bindingIds ?? []
  }
}

export function selectedCapabilities(value: unknown): Array<{ kind: PromptCapabilityKind; id: string }> {
  const selection = parsePromptCapabilitySelection(value)
  return PROMPT_CAPABILITY_KINDS.flatMap((kind) =>
    [...new Set([...capabilityIds(selection, kind), ...capabilityIds(selection?.recommended, kind)])].map((id) => ({
      kind,
      id
    }))
  )
}

function replaceIds(
  selection: RuntimeCapabilitiesSelectionSet,
  kind: PromptCapabilityKind,
  id: string,
  selected: boolean
): RuntimeCapabilitiesSelectionSet {
  const ids = capabilityIds(selection, kind).filter((item) => item !== id)
  if (selected) ids.push(id)
  switch (kind) {
    case 'skill':
      return { ...selection, skills: { ...selection.skills, ids } }
    case 'plugin':
      return { ...selection, plugins: { ...selection.plugins, nodeKeys: ids } }
    case 'subAgent':
      return { ...selection, subAgents: { ...selection.subAgents, nodeKeys: ids } }
    case 'connector':
      return { ...selection, connectors: { ...selection.connectors, bindingIds: ids } }
  }
}

export function changePromptCapability(
  value: unknown,
  xpertId: string,
  option: Pick<PromptCapabilityOption, 'kind' | 'id'>,
  selected: boolean,
  workspaceId: string
): unknown {
  const config = parsePromptCapabilityConfig(value)
  const legacy = parsePromptCapabilitySelection(value)
  if (value != null && !config && !legacy) return value
  const original = xpertId
    ? parsePromptCapabilitySelection(resolvePromptWorkflowCapabilities(value, xpertId))
    : (config?.defaults ?? legacy)
  const selection: RuntimeCapabilitiesSelection = original ?? {
    mode: 'allowlist',
    inheritUnselected: true,
    skills: { workspaceId, ids: [] },
    plugins: { nodeKeys: [] }
  }
  const changed: RuntimeCapabilitiesSelection = {
    ...selection,
    ...replaceIds(selection, option.kind, option.id, selected),
    ...(selected || selection.recommended
      ? {
          recommended: replaceIds(
            selection.recommended ?? {
              skills: { workspaceId: selection.skills.workspaceId, ids: [] },
              plugins: { nodeKeys: [] }
            },
            option.kind,
            option.id,
            selected
          )
        }
      : {})
  }
  // An empty old allowlist remains restrictive; an empty additive selection inherits defaults.
  const next = selectedCapabilities(changed).length || changed.inheritUnselected !== true ? changed : null
  if (!xpertId) return config ? { ...config, defaults: next } : next
  const result: PromptWorkflowCapabilityConfig = {
    ...(config ?? { type: 'expert_scoped_capabilities', version: 1, defaults: legacy, experts: [] }),
    experts: [...(config?.experts ?? []).filter((entry) => entry.xpertId !== xpertId), { xpertId, selection: next }]
  }
  if (!result.defaults) result.experts = result.experts.filter((entry) => entry.selection !== null)
  return !result.defaults && !result.experts.length ? null : result
}

export function restoreExpertCapabilityDefaults(value: unknown, xpertId: string): unknown {
  const config = parsePromptCapabilityConfig(value)
  if (!config) return value
  const experts = config.experts.filter((entry) => entry.xpertId !== xpertId)
  return !config.defaults && !experts.length ? null : { ...config, experts }
}

export function runtimeCapabilityOptions(data: IAiAssistantRuntimeCapabilities): PromptCapabilityOption[] {
  const result: PromptCapabilityOption[] = []
  const groups: Array<[PromptCapabilityKind, unknown[] | undefined]> = [
    ['skill', data.skills],
    ['plugin', data.plugins],
    ['subAgent', data.subAgents]
  ]
  for (const [kind, values] of groups) {
    for (const value of values ?? []) {
      if (typeof value !== 'object' || value === null) continue
      const id =
        kind === 'skill' ? ('id' in value ? value.id : undefined) : 'nodeKey' in value ? value.nodeKey : undefined
      if (typeof id !== 'string' || !id) continue
      result.push({
        kind,
        id,
        label: 'label' in value && typeof value.label === 'string' ? value.label : id,
        description: 'description' in value && typeof value.description === 'string' ? value.description : undefined
      })
    }
  }
  return result
}

export function connectorCapabilityOptions(data: ConnectorRuntimeOptions, language: string): PromptCapabilityOption[] {
  return data.items.map((item) => ({
    kind: 'connector',
    id: item.bindingId,
    label: resolveLocalizedText(item.label, language) ?? item.provider,
    description: resolveLocalizedText(item.description, language),
    ...(!item.granted
      ? { unavailable: 'authorization' as const }
      : item.status !== 'active'
        ? { unavailable: 'connection' as const }
        : {})
  }))
}
