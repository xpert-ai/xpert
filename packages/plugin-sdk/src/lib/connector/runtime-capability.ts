import { createRuntimeCapability } from '../core'
import type { RuntimeIdentityScope } from '../runtime/runtime-scope'
import type { ConnectorRuntimeApi } from './strategy.interface'

export const ConnectorRuntimeCapability = createRuntimeCapability<ConnectorRuntimeApi>('platform.connector', {
  description: 'Resolve connector credentials for agent middleware.'
})

/** No binding or provider grants means no connector access. */
export type ConnectorRuntimeScope = RuntimeIdentityScope & {
  /** Host-selected bindings, including IDs pinned by enabled graph Connector nodes. */
  connectorBindingIds?: string[] | null
  /** Providers configured by enabled graph Connector nodes without a pinned ID. */
  connectorProviders?: string[] | null
}

export type SelectedRuntimeConnectorBinding = { bindingId: string; provider: string }

export interface ConnectorRuntimeFactory {
  /** Snapshot the authorized identity and connector grants for this runtime. */
  createScopedApi(scope: ConnectorRuntimeScope): ConnectorRuntimeApi
  /** Preflight selected bindings through the same identity, project and credential checks. */
  resolveSelectedRuntimeBindings(
    bindingIds: string[] | null | undefined,
    scope: ConnectorRuntimeScope
  ): Promise<SelectedRuntimeConnectorBinding[]>
}

export const ConnectorRuntimeFactoryCapability = createRuntimeCapability<ConnectorRuntimeFactory>(
  'platform.connector.factory',
  { description: 'Create a connector API restricted to host-granted connectors and the authorized execution identity.' }
)
