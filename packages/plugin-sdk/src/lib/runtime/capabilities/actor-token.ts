import { createRuntimeCapability } from '../../core/runtime-capability'

export type ActorTokenAct = Record<string, string | number | boolean | null | undefined>

export interface ActorTokenRequest {
  audience?: string | string[]
  ttlSeconds?: number
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
