import type { IssuedAuthTokens } from './auth-login'
import type { BasePermission } from './general'

export type BoundIdentityLoginPermissionOperation = 'create' | 'provision'

/**
 * Bound identity login permission
 * Example: { type: 'bound_identity_login', operations: ['create'], providers: ['lark'] }
 */
export interface BoundIdentityLoginPermission extends BasePermission {
  type: 'bound_identity_login'
  operations?: BoundIdentityLoginPermissionOperation[]
  providers?: string[]
}

/**
 * System token for resolving bound identity login permission service from plugin context.
 */
export const BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN = 'XPERT_PLUGIN_BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE'

export interface BoundIdentityLoginInput {
  provider: string
  subjectId: string
  tenantId: string
  organizationId?: string | null
}

export interface VerifiedEmailLoginInput {
  provider: string
  subjectId: string
  tenantId: string
  verifiedEmail: string
  displayName?: string
  avatarUrl?: string
  profile?: Record<string, unknown>
  returnTo?: string
}

export type VerifiedEmailLoginResult =
  | {
      status: 'authenticated'
      tokens: IssuedAuthTokens
    }
  | {
      status: 'registration_required'
      ticket: string
    }

export interface BoundIdentityLoginPermissionService {
  loginWithBoundIdentity(input: BoundIdentityLoginInput): Promise<IssuedAuthTokens | null>
  loginOrPrepareVerifiedEmail(input: VerifiedEmailLoginInput): Promise<VerifiedEmailLoginResult>
}
