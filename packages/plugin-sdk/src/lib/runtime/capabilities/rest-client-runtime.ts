import type { JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { RuntimeIdentityScope } from '../runtime-scope'

/** References a saved OpenAPI toolset; transport addresses and credentials stay in the host. */
export interface RestClientScope {
  actor: Required<Pick<RuntimeIdentityScope, 'tenantId' | 'organizationId' | 'userId'>>
  workspaceId: string
  toolsetId: string
  signal: AbortSignal
  deadlineAt: number
}

export interface RestOperationDescriptor {
  operationId: string
  description?: string
  method: 'GET' | 'POST'
  inputSchema: Record<string, JSONValue>
  /** Pins endpoint, parameter serialization and read-only declaration, not access grants. */
  contractHash: string
}

export interface RestOperationCall {
  operationId: string
  contractHash: string
  arguments: Record<string, JSONValue>
}

export interface RestClientRuntimeApi {
  readonly operations: {
    /** Enabled GET operations and POST operations explicitly declared x-xpert-read-only. */
    list(scope: RestClientScope): Promise<RestOperationDescriptor[]>
    call(scope: RestClientScope, request: RestOperationCall): Promise<{ body: JSONValue; sourceFetchedAt: string }>
  }
}

export const RestClientRuntimeCapability = createRuntimeCapability<RestClientRuntimeApi>('platform.rest.client', {
  description: 'Governed JSON access through saved OpenAPI connections and platform-managed authentication.'
})
