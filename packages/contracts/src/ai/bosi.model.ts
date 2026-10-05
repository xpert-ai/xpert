import type { XpertTemplateSetup } from './xpert-template.model'
import type { RuntimeResourceReference } from '../agent-plugin'
import type { IconDefinition } from '../types'

/** Persisted choices for one tenant/organization/user binding; runtime access is checked independently. */
export type BosiOnboardingPreferences = {
  version: 1
  /** Choice revision for optimistic concurrency, not the plugin catalog or package version. */
  revision: number
  /** The binding owner's private workspace in the current organization. */
  workspaceId: string
  /** Pin the selected runtime binding/version; do not silently adopt later plugin upgrades. */
  packages: Array<{ packageId: string; resource: RuntimeResourceReference }>
  /** Connector binding IDs in this workspace, not provider IDs used by the selection UI. */
  connectorIds: string[]
}

/** Display and action availability for onboarding; the server rechecks authorization on each action. */
export type BosiOnboardingItem = {
  /** Plugin package ID for `plugin`, connector provider ID for `connector`. */
  id: string
  kind: 'plugin' | 'connector'
  name: string
  description?: string
  icon?: IconDefinition
  status: 'available' | 'ready' | 'requires_auth' | 'expired' | 'configuration_required' | 'unavailable'
  selected: boolean
  canSelect: boolean
  canConnect: boolean
  reason?: string
}

export type BosiOnboardingCatalog = {
  workspace: { id: string; name: string }
  /** Echo in a choice request; an outdated revision requires refreshing the catalog. */
  revision: number
  items: BosiOnboardingItem[]
}

export type BosiOnboardingChoice = {
  revision: number
  kind: BosiOnboardingItem['kind']
  /** The catalog item ID, whose meaning is determined by `kind`. */
  id: string
  selected: boolean
}

/** Optional bootstrap capabilities; these keys match the existing template capability registry. */
export type BosiCapability = 'cloud-computer' | 'desktop-shell'

/** Authorized setup snapshot; access/query errors must not be represented as an empty binding. */
export type BosiSetup = {
  assistantId: string | null
  /** Null also occurs for an existing legacy Assistant; it does not mean onboarding is required. */
  progress: {
    /** `ready` requires a successful welcome execution; publication alone is `welcome_pending`. */
    phase: 'installing' | 'welcome_pending' | 'welcome_running' | 'ready' | 'welcome_failed'
    /** Choices are fixed once installation starts and reused on recovery. */
    capabilities: BosiCapability[]
    /** Opaque ID from XpertTemplateSetup.models, not a provider model name. */
    modelId: string
    /** Preallocated first-conversation ID; the thread may not exist until welcome starts. */
    threadId: string
  } | null
  /** Installation choices are returned while the binding has no published Assistant. */
  setup?: XpertTemplateSetup
  /** Server availability only; Desktop must additionally check its local Shell support. */
  capabilities?: { key: BosiCapability; available: boolean; reason?: string }[]
}
