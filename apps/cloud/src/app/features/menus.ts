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

type MenuScope = 'tenant-only' | 'organization-only' | 'dual-scope'
type ScopedMenuItem = PacMenuItem & { scopeContext?: MenuScope }

export function getFeatureMenus(
  scopeLevel: RequestScopeLevel,
  _org: IOrganization | null
): PacMenuItem[] {
  const settingsChildren: ScopedMenuItem[] = [
    {
      title: 'Account',
      icon: 'account_circle',
      link: '/settings/account',
      scopeContext: 'dual-scope' as MenuScope,
      data: {
        translationKey: 'Account'
      }
    },
    {
      title: 'AI Copilot',
      icon: 'psychology',
      link: '/settings/copilot',
      scopeContext: 'organization-only' as MenuScope,
      data: {
        translationKey: 'AI Copilot',
        permissionKeys: [AIPermissionsEnum.COPILOT_EDIT],
        featureKey: AiFeatureEnum.FEATURE_COPILOT
      }
    },
    {
      title: 'Data Sources',
      icon: 'database',
      link: '/settings/data-sources',
      admin: true,
      scopeContext: 'organization-only' as MenuScope,
      data: {
        translationKey: 'Data Sources',
        permissionKeys: [AnalyticsPermissionsEnum.DATA_SOURCE_EDIT],
        featureKey: AnalyticsFeatures.FEATURE_MODEL
      }
    },
    {
      title: 'Assistants',
      icon: 'robot_2',
      link: '/settings/assistants',
      scopeContext: 'dual-scope' as MenuScope,
      data: {
        translationKey: 'Assistants',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN]
      }
    },
    {
      title: 'Chat BI',
      icon: 'try',
      link: '/settings/chatbi',
      scopeContext: 'organization-only' as MenuScope,
      data: {
        translationKey: 'Chat BI',
        permissionKeys: [AnalyticsPermissionsEnum.MODELS_EDIT],
        featureKey: [AiFeatureEnum.FEATURE_XPERT, AnalyticsFeatures.FEATURE_MODEL]
      }
    },
    {
      title: 'User',
      icon: 'people',
      link: '/settings/users',
      scopeContext: 'tenant-only' as MenuScope,
      data: {
        translationKey: 'User',
        permissionKeys: [PermissionsEnum.ORG_USERS_EDIT],
        featureKey: FeatureEnum.FEATURE_USER
      }
    },
    {
      title: 'Roles',
      icon: 'supervisor_account',
      link: '/settings/roles',
      scopeContext: 'tenant-only' as MenuScope,
      data: {
        translationKey: 'Role & Permission',
        featureKey: FeatureEnum.FEATURE_ROLES_PERMISSION,
        permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
      }
    },
    {
      title: 'Business Area',
      icon: 'workspaces',
      link: '/settings/business-area',
      pathMatch: 'prefix',
      scopeContext: 'organization-only' as MenuScope,
      data: {
        translationKey: 'Business Area',
        featureKey: AnalyticsFeatures.FEATURE_BUSINESS_AREA,
        permissionKeys: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT]
      }
    },
    {
      title: 'Certification',
      icon: 'verified_user',
      link: '/settings/certification',
      pathMatch: 'prefix',
      scopeContext: 'organization-only' as MenuScope,
      data: {
        translationKey: 'Certification',
        featureKey: AnalyticsFeatures.FEATURE_MODEL,
        permissionKeys: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT]
      }
    },
    {
      title: 'Integration',
      icon: 'hub',
      link: '/settings/integration',
      pathMatch: 'prefix',
      scopeContext: 'organization-only' as MenuScope,
      data: {
        translationKey: 'System Integration',
        featureKey: FeatureEnum.FEATURE_INTEGRATION,
        permissionKeys: [PermissionsEnum.INTEGRATION_EDIT]
      }
    },
    {
      title: 'Email Templates',
      icon: 'email',
      link: '/settings/email-templates',
      scopeContext: 'dual-scope' as MenuScope,
      data: {
        translationKey: 'Email Template',
        permissionKeys: [PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES],
        featureKey: FeatureEnum.FEATURE_EMAIL_TEMPLATE
      }
    },
    {
      title: 'Custom SMTP',
      icon: 'alternate_email',
      link: '/settings/custom-smtp',
      scopeContext: 'dual-scope' as MenuScope,
      data: {
        translationKey: 'Custom SMTP',
        permissionKeys: [PermissionsEnum.CUSTOM_SMTP_VIEW],
        featureKey: FeatureEnum.FEATURE_SMTP
      }
    },
    {
      title: 'Feature',
      icon: 'widgets',
      link:
        scopeLevel === RequestScopeLevel.TENANT
          ? '/settings/features/tenant'
          : '/settings/features/organization',
      scopeContext: 'dual-scope' as MenuScope,
      data: {
        translationKey: 'Feature',
        permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
      }
    },
    {
      title: 'Organizations',
      icon: 'corporate_fare',
      link: '/settings/organizations',
      scopeContext: 'tenant-only' as MenuScope,
      data: {
        translationKey: 'Organization',
        permissionKeys: [RolesEnum.SUPER_ADMIN]
      }
    },
    {
      title: 'Plugins',
      icon: 'extension',
      link: '/settings/plugins',
      scopeContext: 'dual-scope' as MenuScope,
      data: {
        translationKey: 'Plugins',
        permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL]
      }
    },
    {
      title: 'Tenant',
      icon: 'storage',
      link: '/settings/tenant',
      scopeContext: 'tenant-only' as MenuScope,
      data: {
        translationKey: 'Tenant',
        permissionKeys: [RolesEnum.SUPER_ADMIN]
      }
    }
  ].filter((item) => matchesScope(item.scopeContext, scopeLevel))

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
        permissionKeys: [AnalyticsPermissionsEnum.STORIES_VIEW]
      },
      children: [
        {
          title: 'Story',
          icon: 'auto_stories',
          link: '/project',
          data: {
            translationKey: 'Story',
            featureKey: AnalyticsFeatures.FEATURE_STORY,
            permissionKeys: [AnalyticsPermissionsEnum.STORIES_VIEW]
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
      title: 'Indicator Market',
      icon: 'local_grocery_store',
      link: '/indicator/market',
      scopeContext: 'dual-scope',
      data: {
        translationKey: 'Indicator Market',
        featureKey: [AnalyticsFeatures.FEATURE_INDICATOR, AnalyticsFeatures.FEATURE_INDICATOR_MARKET],
        permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW]
      }
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
        permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_VIEW]
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
      },
      children: settingsChildren
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
