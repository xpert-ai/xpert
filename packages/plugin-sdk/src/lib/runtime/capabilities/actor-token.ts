import { createRuntimeCapability } from '../../core/runtime-capability'
import type { RuntimeIdentityScope } from '../runtime-scope'

export type ActorTokenAct = Record<string, string | number | boolean | null | undefined>

export interface ActorTokenRequest {
  audience?: string | string[]
  ttlSeconds?: number
  /** Extra delegation metadata; cannot replace claims fixed by the host when creating the API. */
  act?: ActorTokenAct
}

export interface ActorTokenResult {
  token: string
  expiresAt: string
  audience: string | string[]
}

export interface ActorTokenApi {
  getToken(input?: ActorTokenRequest): Promise<ActorTokenResult>
}

export const ActorTokenRuntimeCapability = createRuntimeCapability<ActorTokenApi>('platform.actor-token', {
  description: 'Mint a short-lived host-issued actor bearer token for outbound API calls.'
})

/** Host-defined delegation claims are fixed when the API is created. */
export type ActorTokenRuntimeScope = RuntimeIdentityScope & { act?: ActorTokenAct }

export interface ActorTokenRuntimeFactory {
  /** Create one independent token cache for a host-authorized caller/execution. */
  createScopedApi(scope: ActorTokenRuntimeScope): ActorTokenApi
}

/** Platform registry entry. The operation capability above is bound only inside a caller runtime. */
export const ActorTokenRuntimeFactoryCapability = createRuntimeCapability<ActorTokenRuntimeFactory>(
  'platform.actor-token.factory',
  { description: 'Create an actor-token API with host-bound identity, delegation claims and an isolated token cache.' }
)
