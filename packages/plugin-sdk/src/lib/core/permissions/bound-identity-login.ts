import type { IssuedAuthTokens } from './auth-login'
import type { BasePermission } from './general'

export type BoundIdentityLoginPermissionOperation = 'create'

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
export const BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN =
  'XPERT_PLUGIN_BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE'

export interface BoundIdentityLoginInput {
  provider: string
  subjectId: string
  tenantId: string
  organizationId?: string | null
}

export interface BoundIdentityLoginPermissionService {
  loginWithBoundIdentity(input: BoundIdentityLoginInput): Promise<IssuedAuthTokens | null>
}
