import type { IUser } from '@xpert-ai/contracts'
import type { BasePermission } from './general'

export type AccountBindingPermissionOperation = 'read' | 'write' | 'delete'

/**
 * Account Binding Permission
 * Example: { type: 'account_binding', operations: ['write'], providers: ['feishu'] }
 */
export interface AccountBindingPermission extends BasePermission {
  type: 'account_binding'
  operations?: AccountBindingPermissionOperation[]
  providers?: string[]
  scope?: string[]
}

/**
 * System token for resolving account binding permission service from plugin context.
 */
export const ACCOUNT_BINDING_PERMISSION_SERVICE_TOKEN =
  'XPERT_PLUGIN_ACCOUNT_BINDING_PERMISSION_SERVICE'

export interface BindCurrentUserInput {
  provider: string
  subjectId: string
  profile?: Record<string, any>
}

export interface ResolveBoundUserInput {
  provider: string
  subjectId: string
  tenantId?: string
}

export interface BoundIdentityRef {
  provider: string
  subjectId: string
}

export interface AccountBindingPermissionService {
  bindCurrentUser(input: BindCurrentUserInput): Promise<BoundIdentityRef>
  resolveBoundUser<TUser = IUser>(input: ResolveBoundUserInput): Promise<TUser | null>
  unbindCurrentUser(provider: string): Promise<void>
}
