import { AIPermissionsEnum as AI } from './ai/role-permissions'
import { PermissionsEnum as P } from './role-permission.model'

/** Display-only grouping. PermissionGroups remains the authority for access rules. */
export type RolePermissionModule = 'ai' | 'projects' | 'members' | 'billing' | 'data' | 'personal' | 'other'

const modulePermissions: ReadonlyArray<{
  module: RolePermissionModule
  permissions: readonly (P | AI)[]
}> = [
  {
    module: 'ai',
    permissions: [
      AI.KNOWLEDGEBASE_EDIT,
      AI.COPILOT_VIEW,
      AI.COPILOT_EDIT,
      AI.MODEL_USAGE_MONITOR,
      AI.MODEL_ACCESS_REQUEST_VIEW,
      AI.MODEL_ACCESS_REQUEST_EDIT,
      AI.MODEL_GATEWAY_USE,
      AI.MODEL_GATEWAY_MANAGE,
      AI.XPERT_EDIT,
      AI.CHAT_VIEW,
      AI.EVOLUTION_VIEW,
      AI.EVOLUTION_MANAGE
    ]
  },
  {
    module: 'projects',
    permissions: [AI.XPERT_PROJECT_VIEW, AI.XPERT_PROJECT_CREATE, AI.XPERT_PROJECT_EDIT, AI.XPERT_PROJECT_MANAGE]
  },
  {
    module: 'members',
    permissions: [
      P.ADMIN_DASHBOARD_VIEW,
      P.ORG_INVITE_VIEW,
      P.ORG_INVITE_EDIT,
      P.ORG_DEMO_EDIT,
      P.ORG_USERS_VIEW,
      P.ORG_USERS_EDIT,
      P.ALL_ORG_VIEW,
      P.ALL_ORG_EDIT,
      P.CHANGE_SELECTED_ORGANIZATION,
      P.CHANGE_ROLES_PERMISSIONS,
      P.SUPER_ADMIN_EDIT,
      P.ACCESS_DELETE_ACCOUNT,
      P.ACCESS_DELETE_ALL_DATA,
      P.REFERRAL_VIEW
    ]
  },
  {
    module: 'billing',
    permissions: [
      AI.MEMBERSHIP_EDIT,
      AI.MEMBERSHIP_USE,
      AI.BILLING_PRODUCT_EDIT,
      AI.BILLING_REFUND,
      AI.PAYMENT_PROVIDER_EDIT
    ]
  },
  {
    module: 'data',
    permissions: [
      P.VIEW_ALL_EMAILS,
      P.VIEW_ALL_EMAIL_TEMPLATES,
      P.INTEGRATION_EDIT,
      P.INTEGRATION_VIEW,
      P.DATA_SOURCE_VIEW,
      P.DATA_SOURCE_EDIT,
      P.BUSINESS_AREA_VIEW,
      P.BUSINESS_AREA_MANAGE,
      P.BUSINESS_AREA_ASSIGN
    ]
  },
  { module: 'personal', permissions: [P.PROFILE_EDIT] }
]

export const ROLE_PERMISSION_MODULES: ReadonlyMap<string, RolePermissionModule> = new Map(
  modulePermissions.flatMap(({ module, permissions }) => permissions.map((permission) => [permission, module] as const))
)
