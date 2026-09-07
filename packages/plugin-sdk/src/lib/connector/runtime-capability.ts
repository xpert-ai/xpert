import { createRuntimeCapability } from '../core'
import type { RuntimeIdentityScope } from '../runtime/runtime-scope'
import type { ConnectorRuntimeApi } from './strategy.interface'

export const ConnectorRuntimeCapability = createRuntimeCapability<ConnectorRuntimeApi>('platform.connector', {
  description: 'Resolve connector credentials for agent middleware.'
})

export type ConnectorRuntimeScope = RuntimeIdentityScope & {
  /** Host-selected binding IDs. Missing or empty means no connector access. */
  connectorBindingIds?: string[] | null
}

export type SelectedRuntimeConnectorBinding = { bindingId: string; provider: string }

export interface ConnectorRuntimeFactory {
  /** Snapshot the authorized identity and selected binding IDs for this runtime. */
  createScopedApi(scope: ConnectorRuntimeScope): ConnectorRuntimeApi
  /** Preflight selected bindings through the same identity, project and credential checks. */
  resolveSelectedRuntimeBindings(
    bindingIds: string[] | null | undefined,
    scope: ConnectorRuntimeScope
  ): Promise<SelectedRuntimeConnectorBinding[]>
}

export const ConnectorRuntimeFactoryCapability = createRuntimeCapability<ConnectorRuntimeFactory>(
  'platform.connector.factory',
  { description: 'Create a connector API restricted to host-selected bindings and the authorized execution identity.' }
)
