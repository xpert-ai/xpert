import { AIPermissionsEnum as AI } from './ai/role-permissions'
import { PermissionsEnum as P, PermissionGroups } from './role-permission.model'

/** Display-only grouping. Runtime access is determined by enabled grants and endpoint/resource policy. */
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
      AI.XPERT_VIEW,
      AI.XPERT_WORKSPACE_MANAGE,
      AI.APPLICATION_USE,
      AI.APPLICATION_INSTALL,
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
      P.ANNOUNCEMENT_MANAGE,
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

export const DEPRECATED_ROLE_PERMISSIONS = [
  P.ADMIN_DASHBOARD_VIEW,
  P.VIEW_ALL_EMAILS,
  P.ORG_DEMO_EDIT,
  AI.COPILOT_VIEW,
  P.CHANGE_SELECTED_ORGANIZATION,
  P.ACCESS_DELETE_ACCOUNT
] as const

export const UNWIRED_AI_PERMISSIONS: readonly AI[] = [
  AI.BILLING_PRODUCT_EDIT,
  AI.BILLING_REFUND,
  AI.PAYMENT_PROVIDER_EDIT
]

/** Complete UI/documentation catalog; presence here never grants access or implies endpoint enforcement. */
export const ROLE_PERMISSION_CATALOG = [...Object.values(P), ...Object.values(AI)].map((permission) => ({
  permission,
  module: ROLE_PERMISSION_MODULES.get(permission) ?? 'other',
  deprecated: (DEPRECATED_ROLE_PERMISSIONS as readonly string[]).includes(permission),
  configurable: [...PermissionGroups.GENERAL, ...PermissionGroups.ADMINISTRATION].some((code) => code === permission),
  contractOnly: (UNWIRED_AI_PERMISSIONS as readonly string[]).includes(permission)
}))
