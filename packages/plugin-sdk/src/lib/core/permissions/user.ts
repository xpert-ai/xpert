import type { IUser } from '@metad/contracts'
import type { BasePermission } from './general'

export type UserPermissionOperation = 'read' | 'write' | 'update' | 'delete'

/**
 * User Permission
 * Example: { type: 'user', operations: ['read'] }
 */
export interface UserPermission extends BasePermission {
  type: 'user'
  operations?: UserPermissionOperation[]
  scope?: string[]
}

/**
 * System token for resolving user permission service from plugin context.
 */
export const USER_PERMISSION_SERVICE_TOKEN = 'XPERT_PLUGIN_USER_PERMISSION_SERVICE'

export interface UserProvisionByThirdPartyIdentityInput {
  tenantId: string
  thirdPartyId: string
  profile?: Partial<
    Pick<
      IUser,
      'username' | 'email' | 'mobile' | 'imageUrl' | 'firstName' | 'lastName' | 'preferredLanguage'
    >
  >
  defaults?: {
    roleId?: string
    roleName?: string
  }
}

export interface UserPermissionService {
  read<TUser = IUser>(criteria: Record<string, any>): Promise<TUser | null>
  provisionByThirdPartyIdentity<TUser = IUser>(
    input: UserProvisionByThirdPartyIdentityInput
  ): Promise<TUser | null>
}
