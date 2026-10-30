import { DEPRECATED_ROLE_PERMISSIONS, RolesEnum } from '@xpert-ai/contracts'

export { DEPRECATED_ROLE_PERMISSIONS } from '@xpert-ai/contracts'

const DEPRECATED_ROLE_PERMISSION_SET = new Set<string>(DEPRECATED_ROLE_PERMISSIONS)

export function isDeprecatedRolePermission(permission: string): boolean {
  return DEPRECATED_ROLE_PERMISSION_SET.has(permission)
}

export function isRolePermissionReadonly(roleName?: string | null): boolean {
  return roleName === RolesEnum.SUPER_ADMIN
}
