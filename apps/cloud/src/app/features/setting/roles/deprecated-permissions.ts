import { AIPermissionsEnum, PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'

export const DEPRECATED_ROLE_PERMISSIONS = [
  PermissionsEnum.ADMIN_DASHBOARD_VIEW,
  PermissionsEnum.VIEW_ALL_EMAILS,
  PermissionsEnum.ORG_DEMO_EDIT,
  AIPermissionsEnum.COPILOT_VIEW,
  PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
  PermissionsEnum.ACCESS_DELETE_ACCOUNT
] as const

const DEPRECATED_ROLE_PERMISSION_SET = new Set<string>(DEPRECATED_ROLE_PERMISSIONS)

export function isDeprecatedRolePermission(permission: string): boolean {
  return DEPRECATED_ROLE_PERMISSION_SET.has(permission)
}

export function isRolePermissionReadonly(roleName?: string | null): boolean {
  return roleName === RolesEnum.SUPER_ADMIN
}
