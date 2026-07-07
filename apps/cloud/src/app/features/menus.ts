import {
  AiFeatureEnum,
  AIPermissionsEnum,
  AnalyticsFeatures,
  AnalyticsPermissionsEnum,
  FeatureEnum,
  IOrganization,
  PermissionsEnum,
  RequestScopeLevel,
  RolesEnum
} from '../@core/types'
import { CloudMenuItem } from './sidebar/cloud-sidebar-menu.types'

export type MenuScope = 'tenant-only' | 'organization-only' | 'dual-scope'
type MenuFeatureKey = AiFeatureEnum | AnalyticsFeatures | FeatureEnum
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
    {
      path: 'data-sources',
      label: 'Data Sources',
      icon: 'database',
      admin: true,
      scopeContext: 'organization-only',
      data: {
        permissionKeys: [AnalyticsPermissionsEnum.DATA_SOURCE_EDIT],
        featureKey: AnalyticsFeatures.FEATURE_DATA_SOURCE
      }
    },
    {
      path: 'assistants',
      label: 'Assistants',
      icon: 'robot_2',
      scopeContext: 'dual-scope',
      subtitleKey: isTenantScope ? 'PAC.Assistant.MenuTenantSubtitle' : 'PAC.Assistant.MenuOrganizationSubtitle',
      subtitleDefault: isTenantScope ? 'Tenant defaults' : 'Organization overrides',
      data: {
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN]
      }
    },
    {
      path: 'chatbi',
      label: 'Chat BI',
      icon: 'try',
      deprecated: true,
      scopeContext: 'dual-scope',
      data: {
        permissionKeys: [AnalyticsPermissionsEnum.MODELS_EDIT],
        featureKey: [AiFeatureEnum.FEATURE_XPERT, AnalyticsFeatures.FEATURE_MODEL]
      }
    },
    {
      path: 'business-area',
      label: 'Business Area',
      icon: 'business_center',
      deprecated: true,
      pathMatch: 'prefix',
      scopeContext: 'organization-only',
      data: {
        featureKey: AnalyticsFeatures.FEATURE_BUSINESS_AREA,
        permissionKeys: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT]
      }
    },
    {
      path: 'certification',
      label: 'Certification',
      icon: 'verified_user',
      deprecated: true,
      pathMatch: 'prefix',
      scopeContext: 'organization-only',
      data: {
        permissionKeys: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT]
      }
    },
    {
      path: 'integration',
      label: 'System Integration',
      icon: 'hub',
      pathMatch: 'prefix',
      scopeContext: 'organization-only',
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
      subtitleKey: isTenantScope ? 'PAC.Organization.MenuTenantSubtitle' : 'PAC.Organization.MenuOrganizationSubtitle',
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
      title: 'Tasks',
      icon: 'ri-list-check-3',
      link: '/chat/tasks',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Tasks',
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
    // {
    //   title: 'Project',
    //   icon: 'ri-building-line',
    //   link: '/project',
    //   pathMatch: 'prefix',
    //   scopeContext: 'dual-scope',
    //   data: {
    //     translationKey: 'Project',
    //     featureKey: AiFeatureEnum.FEATURE_XPERT,
    //     permissionKeys: [AIPermissionsEnum.CHAT_VIEW]
    //   }
    // },
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

    // BI Features
    // {
    //   title: 'Dashboard',
    //   icon: 'leaderboard',
    //   link: '/dashboard',
    //   pathMatch: 'prefix',
    //   // home: true,
    //   data: {
    //     translationKey: 'Dashboard',
    //     featureKey: FeatureEnum.FEATURE_HOME
    //   },
    //   children: [
    //     {
    //       title: 'Today',
    //       icon: 'today',
    //       link: '/dashboard',
    //       data: {
    //         translationKey: 'Today',
    //         featureKey: FeatureEnum.FEATURE_DASHBOARD
    //       }
    //     },
    //     {
    //       title: 'Catalog',
    //       icon: 'subscriptions',
    //       link: '/dashboard/catalog',
    //       data: {
    //         translationKey: 'Catalog',
    //         featureKey: FeatureEnum.FEATURE_DASHBOARD
    //       }
    //     },
    //     {
    //       title: 'Trending',
    //       icon: 'timeline',
    //       link: '/dashboard/trending',
    //       data: {
    //         translationKey: 'Trending',
    //         featureKey: FeatureEnum.FEATURE_DASHBOARD
    //       }
    //     }
    //   ]
    // },
    // {
    //   title: 'Data Factory',
    //   icon: 'data_table',
    //   link: '/data',
    //   pathMatch: 'prefix',
    //   data: {
    //     translationKey: 'DataFactory',
    //     featureKey: AnalyticsFeatures.FEATURE_COPILOT_CHATBI,
    //     permissionKeys: [AnalyticsPermissionsEnum.DATA_FACTORY_VIEW]
    //   }
    // },
    {
      title: 'Data',
      icon: 'ri-database-2-line',
      link: '/data',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Data',
        hideWhenAllChildrenHidden: true
      },
      children: [
        {
          title: 'Project',
          icon: 'ri-numbers-line',
          link: '/data/project',
          data: {
            translationKey: 'BI Project',
            featureKey: AnalyticsFeatures.FEATURE_PROJECT,
            permissionKeys: [AnalyticsPermissionsEnum.STORIES_EDIT]
          }
        },
        {
          title: 'Semantic Model',
          icon: 'ri-database-2-line',
          link: '/data/models',
          data: {
            translationKey: 'Semantic Model',
            featureKey: AnalyticsFeatures.FEATURE_MODEL,
            permissionKeys: [AnalyticsPermissionsEnum.MODELS_EDIT]
          }
        }
      ]
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
      title: 'Plugins',
      icon: 'ri-puzzle-2-line',
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
