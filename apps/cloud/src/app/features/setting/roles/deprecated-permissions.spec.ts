import { AIPermissionsEnum, PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import {
  DEPRECATED_ROLE_PERMISSIONS,
  isDeprecatedRolePermission,
  isRolePermissionReadonly
} from './deprecated-permissions'

describe('deprecated role permissions', () => {
  const deprecatedPermissions = [
    PermissionsEnum.ADMIN_DASHBOARD_VIEW,
    PermissionsEnum.VIEW_ALL_EMAILS,
    PermissionsEnum.ORG_DEMO_EDIT,
    AIPermissionsEnum.COPILOT_VIEW,
    PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
    PermissionsEnum.ACCESS_DELETE_ACCOUNT
  ]
  const activePermissions = [
    PermissionsEnum.ORG_INVITE_VIEW,
    AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
    PermissionsEnum.DATA_SOURCE_VIEW,
    PermissionsEnum.SUPER_ADMIN_EDIT,
    PermissionsEnum.ACCESS_DELETE_ALL_DATA
  ]

  it('keeps only unused legacy permissions on the deprecated list', () => {
    expect([...DEPRECATED_ROLE_PERMISSIONS]).toEqual(deprecatedPermissions)
    deprecatedPermissions.forEach((permission) => {
      expect(isDeprecatedRolePermission(permission)).toBe(true)
    })
  })

  it('keeps runtime-enforced permissions in the normal catalog', () => {
    activePermissions.forEach((permission) => {
      expect(isDeprecatedRolePermission(permission)).toBe(false)
    })
  })

  it('does not mark retained replacement permissions as deprecated', () => {
    expect(isDeprecatedRolePermission(PermissionsEnum.ORG_INVITE_EDIT)).toBe(false)
    expect(isDeprecatedRolePermission(PermissionsEnum.INTEGRATION_EDIT)).toBe(false)
    expect(isDeprecatedRolePermission(AIPermissionsEnum.COPILOT_EDIT)).toBe(false)
    expect(isDeprecatedRolePermission(PermissionsEnum.DATA_SOURCE_EDIT)).toBe(false)
  })

  it('makes super admin role permissions readonly', () => {
    expect(isRolePermissionReadonly(RolesEnum.SUPER_ADMIN)).toBe(true)
    expect(isRolePermissionReadonly(RolesEnum.ADMIN)).toBe(false)
  })
})
