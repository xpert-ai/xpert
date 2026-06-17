import { AIPermissionsEnum, AnalyticsPermissionsEnum, PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { DEPRECATED_ROLE_PERMISSIONS, isDeprecatedRolePermission, isRolePermissionReadonly } from './deprecated-permissions'

describe('deprecated role permissions', () => {
  it('marks legacy permission list items as deprecated instead of removing them', () => {
    const deprecatedPermissions = [
      PermissionsEnum.ADMIN_DASHBOARD_VIEW,
      PermissionsEnum.ORG_INVITE_VIEW,
      PermissionsEnum.VIEW_ALL_EMAILS,
      PermissionsEnum.ORG_DEMO_EDIT,
      AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
      AIPermissionsEnum.COPILOT_VIEW,
      AnalyticsPermissionsEnum.DATA_SOURCE_VIEW,
      AnalyticsPermissionsEnum.MODELS_VIEW,
      AnalyticsPermissionsEnum.STORIES_VIEW,
      AnalyticsPermissionsEnum.BUSINESS_AREA_VIEW,
      AnalyticsPermissionsEnum.INDICATOR_VIEW,
      AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW,
      AnalyticsPermissionsEnum.DATA_FACTORY_VIEW,
      AnalyticsPermissionsEnum.DATA_FACTORY_EDIT,
      PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
      PermissionsEnum.SUPER_ADMIN_EDIT,
      PermissionsEnum.ACCESS_DELETE_ACCOUNT,
      PermissionsEnum.ACCESS_DELETE_ALL_DATA
    ]

    expect(DEPRECATED_ROLE_PERMISSIONS).toEqual(expect.arrayContaining(deprecatedPermissions))
    deprecatedPermissions.forEach((permission) => {
      expect(isDeprecatedRolePermission(permission)).toBe(true)
    })
  })

  it('does not mark retained replacement permissions as deprecated', () => {
    expect(isDeprecatedRolePermission(PermissionsEnum.ORG_INVITE_EDIT)).toBe(false)
    expect(isDeprecatedRolePermission(PermissionsEnum.INTEGRATION_EDIT)).toBe(false)
    expect(isDeprecatedRolePermission(AIPermissionsEnum.COPILOT_EDIT)).toBe(false)
    expect(isDeprecatedRolePermission(AnalyticsPermissionsEnum.DATA_SOURCE_EDIT)).toBe(false)
    expect(isDeprecatedRolePermission(AnalyticsPermissionsEnum.STORIES_EDIT)).toBe(false)
  })

  it('makes super admin role permissions readonly', () => {
    expect(isRolePermissionReadonly(RolesEnum.SUPER_ADMIN)).toBe(true)
    expect(isRolePermissionReadonly(RolesEnum.ADMIN)).toBe(false)
  })
})
