/** A personal credential accesses AI APIs as its human owner, subject to their current permissions. */
export const PERSONAL_API_KEY_LIFETIMES = ['30', '90', '365', 'never'] as const
export type PersonalApiKeyLifetime = (typeof PERSONAL_API_KEY_LIFETIMES)[number]

export interface PersonalApiKeyCreateInput {
  name: string
  lifetime?: PersonalApiKeyLifetime
}

/** Public metadata only; neither the secret nor its hash is returned by list endpoints. */
export interface PersonalApiKeySummary {
  id: string
  name: string
  prefix: string
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface PersonalApiKeyCreated {
  key: PersonalApiKeySummary
  token: string
}
