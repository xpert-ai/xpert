import { PacMenuItem } from '@metad/cloud/auth'
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

export type MenuScope = 'tenant-only' | 'organization-only' | 'dual-scope'
type MenuFeatureKey = AiFeatureEnum | AnalyticsFeatures | FeatureEnum
type MenuData = {
  translationKey?: string
  permissionKeys?: string[]
  featureKey?: MenuFeatureKey | MenuFeatureKey[]
  [key: string]: unknown
}

export interface SettingsMenuItem {
  path: string
  label: string
  icon: string
  admin?: boolean
  pathMatch?: 'full' | 'prefix'
  scopeContext?: MenuScope
  subtitleKey?: string
  subtitleDefault?: string
  data?: MenuData
}

type ScopedMenuItem = PacMenuItem & { scopeContext?: MenuScope }

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
      path: 'copilot',
      label: 'AI Copilot',
      icon: 'psychology',
      scopeContext: 'dual-scope',
      data: {
        permissionKeys: [AIPermissionsEnum.COPILOT_EDIT],
        featureKey: AiFeatureEnum.FEATURE_COPILOT
      }
    },
    {
      path: 'data-sources',
      label: 'Data Sources',
      icon: 'database',
      admin: true,
      scopeContext: 'organization-only',
      data: {
        permissionKeys: [AnalyticsPermissionsEnum.DATA_SOURCE_EDIT],
        featureKey: AnalyticsFeatures.FEATURE_MODEL
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
      scopeContext: 'tenant-only',
      data: {
        permissionKeys: [PermissionsEnum.ORG_USERS_EDIT],
        featureKey: FeatureEnum.FEATURE_USER
      }
    },
    {
      path: 'groups',
      label: 'Groups',
      icon: 'group',
      scopeContext: 'organization-only',
      data: {
        permissionKeys: [PermissionsEnum.ORG_USERS_EDIT],
        featureKey: FeatureEnum.FEATURE_USER
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
      path: 'custom-smtp',
      label: 'Custom SMTP',
      icon: 'alternate_email',
      scopeContext: 'dual-scope',
      data: {
        permissionKeys: [PermissionsEnum.CUSTOM_SMTP_VIEW],
        featureKey: FeatureEnum.FEATURE_SMTP
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
        permissionKeys: [PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.CHANGE_SELECTED_ORGANIZATION]
      }
    },
    {
      path: 'plugins',
      label: 'Plugins',
      icon: 'extension',
      scopeContext: 'dual-scope',
      data: {
        permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL]
      }
    },
    {
      path: 'skill-repository',
      label: 'Skills Repository',
      icon: 'hammer',
      scopeContext: 'tenant-only',
      data: {
        permissionKeys: [RolesEnum.SUPER_ADMIN]
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

export function getFeatureMenus(scopeLevel: RequestScopeLevel, _org: IOrganization | null): PacMenuItem[] {
  const menus: ScopedMenuItem[] = [
    // Xpert AI Features
    {
      title: 'Chat',
      icon: 'robot_2',
      link: '/chat',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Chat',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.CHAT_VIEW]
      }
    },
    {
      title: 'Explore Xperts',
      icon: 'explore',
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
      icon: 'orbit',
      link: '/xpert',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Workspace',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.XPERT_EDIT]
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
      title: 'Semantic Model',
      icon: 'deployed_code',
      link: '/models',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Semantic Model',
        featureKey: AnalyticsFeatures.FEATURE_MODEL,
        permissionKeys: [AnalyticsPermissionsEnum.MODELS_EDIT]
      }
    },
    {
      title: 'Project',
      icon: 'dashboard',
      link: '/project',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'BI Project',
        featureKey: AnalyticsFeatures.FEATURE_PROJECT,
        permissionKeys: [AnalyticsPermissionsEnum.STORIES_EDIT]
      },
      children: [
        {
          title: 'Story',
          icon: 'auto_stories',
          link: '/project',
          data: {
            translationKey: 'Story',
            featureKey: AnalyticsFeatures.FEATURE_STORY,
            permissionKeys: [AnalyticsPermissionsEnum.STORIES_EDIT]
          }
        },
        {
          title: 'Indicators',
          icon: 'trending_up',
          link: '/project/indicators',
          data: {
            translationKey: 'Indicators',
            featureKey: AnalyticsFeatures.FEATURE_INDICATOR,
            permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_EDIT]
          }
        }
      ]
    },
    {
      title: 'Indicator App',
      icon: 'trending_up',
      pathMatch: 'prefix',
      link: '/indicator-app',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Indicator App',
        featureKey: [AnalyticsFeatures.FEATURE_INDICATOR, AnalyticsFeatures.FEATURE_INDICATOR_APP],
        permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW]
      }
    },
    {
      title: 'Settings',
      icon: 'settings',
      link: '/settings',
      admin: true,
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Settings',
        featureKey: FeatureEnum.FEATURE_SETTING
      }
    }
  ]

  return menus.filter((item) => matchesScope(item.scopeContext ?? 'dual-scope', scopeLevel))
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
