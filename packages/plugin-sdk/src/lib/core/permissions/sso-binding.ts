import type { BasePermission } from './general'

export type SsoBindingPermissionOperation = 'create'

/**
 * SSO Binding Permission
 * Example: { type: 'sso_binding', operations: ['create'], providers: ['lark'] }
 */
export interface SsoBindingPermission extends BasePermission {
  type: 'sso_binding'
  operations?: SsoBindingPermissionOperation[]
  providers?: string[]
}

/**
 * System token for resolving the pending SSO binding challenge service from plugin context.
 */
export const SSO_BINDING_PERMISSION_SERVICE_TOKEN = 'XPERT_PLUGIN_SSO_BINDING_PERMISSION_SERVICE'

export type PendingSsoBindingFlow = 'anonymous_bind' | 'current_user_confirm'

export interface CreatePendingBindingInput {
  provider: string
  subjectId: string
  tenantId: string
  organizationId?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  profile?: Record<string, any> | null
  returnTo?: string | null
  flow?: PendingSsoBindingFlow
}

export interface CreatedPendingBindingRef {
  ticket: string
}

export interface SsoBindingPermissionService {
  createPendingBinding(input: CreatePendingBindingInput): Promise<CreatedPendingBindingRef>
}
