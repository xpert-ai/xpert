import { AIPermissionsEnum, PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'

export const DEPRECATED_ROLE_PERMISSIONS = [
  PermissionsEnum.ADMIN_DASHBOARD_VIEW,
  PermissionsEnum.ORG_INVITE_VIEW,
  PermissionsEnum.VIEW_ALL_EMAILS,
  PermissionsEnum.ORG_DEMO_EDIT,
  AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
  AIPermissionsEnum.COPILOT_VIEW,
  PermissionsEnum.DATA_SOURCE_VIEW,
  PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
  PermissionsEnum.SUPER_ADMIN_EDIT,
  PermissionsEnum.ACCESS_DELETE_ACCOUNT,
  PermissionsEnum.ACCESS_DELETE_ALL_DATA
] as const

const DEPRECATED_ROLE_PERMISSION_SET = new Set<string>(DEPRECATED_ROLE_PERMISSIONS)

export function isDeprecatedRolePermission(permission: string): boolean {
  return DEPRECATED_ROLE_PERMISSION_SET.has(permission)
}

export function isRolePermissionReadonly(roleName?: string | null): boolean {
  return roleName === RolesEnum.SUPER_ADMIN
}
