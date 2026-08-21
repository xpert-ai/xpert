import {
  AiFeatureEnum,
  AIPermissionsEnum,
  FeatureEnum,
  IOrganization,
  PermissionsEnum,
  RequestScopeLevel,
  RolesEnum
} from '../@core/types'
import { environment } from '../../environments/environment'
import { CloudMenuItem } from './sidebar/cloud-sidebar-menu.types'

export type MenuScope = 'tenant-only' | 'organization-only' | 'dual-scope'
type MenuFeatureKey = AiFeatureEnum | FeatureEnum
type MenuData = {
  translationKey?: string
  permissionKeys?: string[]
  featureKey?: MenuFeatureKey | MenuFeatureKey[]
  inactivePathPrefixes?: string[]
  hideWhenAllChildrenHidden?: boolean
  [key: string]: unknown
}

export interface SettingsMenuItem {
  path: string
  label: string
  icon: string
  deprecated?: boolean
  admin?: boolean
  pathMatch?: 'full' | 'prefix'
  scopeContext?: MenuScope
  subtitleKey?: string
  subtitleDefault?: string
  data?: MenuData
}

type ScopedMenuItem = CloudMenuItem & { scopeContext?: MenuScope }

export function getSettingsMenuItems(scopeLevel: RequestScopeLevel): SettingsMenuItem[] {
  const isTenantScope = scopeLevel === RequestScopeLevel.TENANT
  const items: SettingsMenuItem[] = [
    {
      path: 'account',
      label: 'Account',
      icon: 'account_circle',
      scopeContext: 'dual-scope'
    },
    ...(environment.settingsExtensions?.menus ?? []),
    {
      path: 'data-sources',
      label: 'Data Sources',
      icon: 'database',
      admin: true,
      scopeContext: 'organization-only',
      data: {
        permissionKeys: [PermissionsEnum.DATA_SOURCE_EDIT],
        featureKey: FeatureEnum.FEATURE_DATA_SOURCE
      }
    },
    {
      path: 'assistants',
      label: 'Assistants',
      icon: 'robot_2',
      scopeContext: 'dual-scope',
      subtitleKey: isTenantScope ? 'XP.Assistant.MenuTenantSubtitle' : 'XP.Assistant.MenuOrganizationSubtitle',
      subtitleDefault: isTenantScope ? 'Tenant defaults' : 'Organization overrides',
      data: {
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN]
      }
    },
    {
      path: 'integration',
      label: 'System Integration',
      icon: 'hub',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        featureKey: FeatureEnum.FEATURE_INTEGRATION,
        permissionKeys: [PermissionsEnum.INTEGRATION_EDIT]
      }
    },
    {
      path: 'users',
      label: 'User',
      icon: 'people',
      scopeContext: 'dual-scope',
      data: {
        permissionKeys: [
          PermissionsEnum.ALL_ORG_VIEW,
          PermissionsEnum.ALL_ORG_EDIT,
          PermissionsEnum.ORG_USERS_VIEW,
          PermissionsEnum.ORG_USERS_EDIT
        ],
        featureKey: FeatureEnum.FEATURE_USERS
      }
    },
    {
      path: 'membership',
      label: 'Membership',
      icon: 'credit-card',
      scopeContext: 'dual-scope',
      data: {
        featureKey: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
        permissionKeys: [AIPermissionsEnum.MEMBERSHIP_EDIT]
      }
    },
    {
      path: 'referrals',
      label: 'ReferralRelationships',
      icon: 'share',
      scopeContext: 'tenant-only',
      data: {
        featureKey: FeatureEnum.FEATURE_REFERRAL,
        permissionKeys: [PermissionsEnum.REFERRAL_VIEW]
      }
    },
    {
      path: 'model-access',
      label: 'Model Access',
      icon: 'approval',
      scopeContext: 'dual-scope',
      data: {
        featureKey: [AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN, AiFeatureEnum.FEATURE_MODEL_ACCESS_REQUEST],
        permissionKeys: [AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW, AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT]
      }
    },
    {
      path: 'model-gateway',
      label: 'Model API Gateway',
      icon: 'code-xml',
      scopeContext: 'dual-scope',
      data: {
        featureKey: AiFeatureEnum.FEATURE_MODEL_GATEWAY,
        permissionKeys: [AIPermissionsEnum.MODEL_GATEWAY_MANAGE]
      }
    },
    {
      path: 'groups',
      label: 'Groups',
      icon: 'group',
      scopeContext: 'organization-only',
      data: {
        permissionKeys: [PermissionsEnum.ORG_USERS_VIEW, PermissionsEnum.ORG_USERS_EDIT],
        featureKey: FeatureEnum.FEATURE_USER_GROUPS
      }
    },
    {
      path: 'roles',
      label: 'Role & Permission',
      icon: 'supervisor_account',
      scopeContext: 'tenant-only',
      data: {
        featureKey: FeatureEnum.FEATURE_ROLES_PERMISSION,
        permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
      }
    },
    {
      path: 'email-templates',
      label: 'Email Template',
      icon: 'email',
      scopeContext: 'dual-scope',
      data: {
        permissionKeys: [PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES],
        featureKey: FeatureEnum.FEATURE_EMAIL_TEMPLATE
      }
    },
    {
      path: scopeLevel === RequestScopeLevel.TENANT ? 'features/tenant' : 'features/organization',
      label: 'Feature',
      icon: 'widgets',
      scopeContext: 'dual-scope',
      data: {
        permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
      }
    },
    {
      path: 'organizations',
      label: 'Organization',
      icon: 'corporate_fare',
      scopeContext: 'dual-scope',
      subtitleKey: isTenantScope ? 'XP.Organization.MenuTenantSubtitle' : 'XP.Organization.MenuOrganizationSubtitle',
      subtitleDefault: isTenantScope ? 'Manage all organizations' : 'Review the current organization',
      data: {
        permissionKeys: [
          PermissionsEnum.ALL_ORG_VIEW,
          PermissionsEnum.ALL_ORG_EDIT,
          PermissionsEnum.ORG_USERS_VIEW,
          PermissionsEnum.ORG_USERS_EDIT
        ],
        featureKey: FeatureEnum.FEATURE_ORGANIZATION
      }
    },
    {
      path: 'tenant',
      label: 'Tenant',
      icon: 'storage',
      scopeContext: 'tenant-only',
      data: {
        permissionKeys: [RolesEnum.SUPER_ADMIN]
      }
    }
  ]

  return items.filter((item) => matchesScope(item.scopeContext ?? 'dual-scope', scopeLevel))
}

export function getFeatureMenus(scopeLevel: RequestScopeLevel, _org: IOrganization | null): CloudMenuItem[] {
  void _org

  const menus: ScopedMenuItem[] = [
    // Xpert AI Features
    {
      title: 'Scheduled',
      icon: 'ri-time-line',
      link: '/chat/tasks',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Scheduled',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.CHAT_VIEW]
      }
    },
    {
      title: 'CodeXpert',
      icon: 'ri-code-box-line',
      link: 'https://code.xpertai.cn/',
      external: true,
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'CodeXpert',
        featureKey: [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CODEXPERT]
      }
    },
    {
      title: 'Data & Ontology',
      icon: 'ri-node-tree',
      link: 'https://data.xpertai.cn/',
      external: true,
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Data & Ontology',
        featureKey: [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_DATA_ONTOLOGY]
      }
    },
    {
      title: 'Project',
      icon: 'ri-group-2-line',
      link: '/project',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Project',
        featureKey: [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_PROJECT],
        permissionKeys: [AIPermissionsEnum.XPERT_PROJECT_VIEW]
      }
    },
    {
      title: 'Explore Xperts',
      icon: 'ri-book-shelf-line',
      link: '/explore',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Explore',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.XPERT_EDIT]
      }
    },
    {
      title: 'Xpert',
      icon: 'ri-apps-line',
      link: '/xpert',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Workspace',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.XPERT_EDIT],
        onboardingTarget: 'workspace'
      }
    },
    {
      title: 'Agent Evolution',
      icon: 'ri-dna-line',
      link: '/agent-evolution',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Agent Evolution',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT]
      }
    },
    {
      title: 'Settings',
      icon: 'settings',
      link: '/settings',
      pathMatch: 'prefix',
      admin: true,
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Settings'
      }
    },
    {
      title: 'Xpert Access Requests',
      icon: 'approval',
      link: '/xpert-access-requests',
      admin: true,
      scopeContext: 'organization-only',
      data: {
        translationKey: 'Xpert Access Requests',
        featureKey: [
          AiFeatureEnum.FEATURE_XPERT,
          AiFeatureEnum.FEATURE_XPERT_MARKETPLACE,
          FeatureEnum.FEATURE_USER_GROUPS
        ],
        permissionKeys: [RolesEnum.AI_BUILDER, RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN]
      }
    },
    {
      title: 'Plugins',
      icon: 'ri-plug-line',
      link: '/plugins',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Plugins',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.XPERT_EDIT],
        onboardingTarget: 'plugins-marketplace'
      }
    },
    {
      title: 'MCP Monitor',
      icon: 'ri-pulse-line',
      link: '/operations',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'MCP Monitor',
        permissionKeys: [RolesEnum.SUPER_ADMIN]
      }
    },
    {
      title: 'Model Providers',
      icon: 'psychology',
      link: '/copilot/basic',
      pathMatch: 'prefix',
      admin: true,
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'AI Copilot',
        featureKey: AiFeatureEnum.FEATURE_COPILOT,
        permissionKeys: [AIPermissionsEnum.COPILOT_EDIT],
        activePathPrefixes: ['/copilot'],
        onboardingTarget: 'model-providers'
      }
    }
  ]

  return menus.filter((item) => matchesScope(item.scopeContext ?? 'dual-scope', scopeLevel))
}

export function syncMenuParentStateFromChildren(item: CloudMenuItem) {
  if (!item.children?.length || !item.data?.hideWhenAllChildrenHidden) {
    return
  }

  const visibleChild = item.children.find((childItem) => !childItem.hidden)

  item.hidden = !visibleChild
  if (visibleChild?.link) {
    item.link = visibleChild.link
  }
}

function matchesScope(scope: MenuScope, level: RequestScopeLevel) {
  if (scope === 'dual-scope') {
    return true
  }

  return (
    (scope === 'tenant-only' && level === RequestScopeLevel.TENANT) ||
    (scope === 'organization-only' && level === RequestScopeLevel.ORGANIZATION)
  )
}
