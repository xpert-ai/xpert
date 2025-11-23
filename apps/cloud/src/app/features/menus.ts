import { PacMenuItem } from '@metad/cloud/auth'
import {
  AiFeatureEnum,
  AIPermissionsEnum,
  AnalyticsFeatures,
  AnalyticsPermissionsEnum,
  FeatureEnum,
  IOrganization,
  PermissionsEnum,
  RolesEnum
} from '../@core/types'

export function getFeatureMenus(org: IOrganization): PacMenuItem[] {
  return [
    // Xpert AI Features
    {
      title: 'Chat',
      matIcon: 'robot_2',
      link: '/chat',
      pathMatch: 'prefix',
      data: {
        translationKey: 'Chat',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.CHAT_VIEW]
      }
    },
    {
      title: 'Explore Xperts',
      matIcon: 'explore',
      link: '/explore',
      pathMatch: 'prefix',
      data: {
        translationKey: 'Explore',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.XPERT_EDIT]
      }
    },
    {
      title: 'Xpert',
      matIcon: 'engineering',
      link: '/xpert',
      pathMatch: 'prefix',
      data: {
        translationKey: 'Workspace',
        featureKey: AiFeatureEnum.FEATURE_XPERT,
        permissionKeys: [AIPermissionsEnum.XPERT_EDIT]
      }
    },

    // BI Features
    {
      title: 'Dashboard',
      matIcon: 'leaderboard',
      link: '/dashboard',
      pathMatch: 'prefix',
      // home: true,
      data: {
        translationKey: 'Dashboard',
        featureKey: FeatureEnum.FEATURE_HOME
      },
      children: [
        {
          title: 'Today',
          matIcon: 'today',
          link: '/dashboard',
          data: {
            translationKey: 'Today',
            featureKey: FeatureEnum.FEATURE_DASHBOARD
          }
        },
        {
          title: 'Catalog',
          matIcon: 'subscriptions',
          link: '/dashboard/catalog',
          data: {
            translationKey: 'Catalog',
            featureKey: FeatureEnum.FEATURE_DASHBOARD
          }
        },
        {
          title: 'Trending',
          matIcon: 'timeline',
          link: '/dashboard/trending',
          data: {
            translationKey: 'Trending',
            featureKey: FeatureEnum.FEATURE_DASHBOARD
          }
        }
      ]
    },
    // {
    //   title: 'Data Factory',
    //   matIcon: 'data_table',
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
      matIcon: 'deployed_code',
      link: '/models',
      pathMatch: 'prefix',
      data: {
        translationKey: 'Semantic Model',
        featureKey: AnalyticsFeatures.FEATURE_MODEL,
        permissionKeys: [AnalyticsPermissionsEnum.MODELS_EDIT]
      }
    },
    {
      title: 'Project',
      matIcon: 'dashboard',
      link: '/project',
      pathMatch: 'prefix',
      data: {
        translationKey: 'BI Project',
        featureKey: AnalyticsFeatures.FEATURE_PROJECT,
        permissionKeys: [AnalyticsPermissionsEnum.STORIES_VIEW]
      },
      children: [
        {
          title: 'Story',
          matIcon: 'auto_stories',
          link: '/project',
          data: {
            translationKey: 'Story',
            featureKey: AnalyticsFeatures.FEATURE_STORY,
            permissionKeys: [AnalyticsPermissionsEnum.STORIES_VIEW]
          }
        },
        {
          title: 'Indicators',
          matIcon: 'trending_up',
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
      matIcon: 'local_grocery_store',
      link: '/indicator/market',
      data: {
        translationKey: 'Indicator Market',
        featureKey: [AnalyticsFeatures.FEATURE_INDICATOR, AnalyticsFeatures.FEATURE_INDICATOR_MARKET],
        permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW]
      }
    },
    {
      title: 'Indicator App',
      matIcon: 'trending_up',
      pathMatch: 'prefix',
      link: '/indicator-app',
      data: {
        translationKey: 'Indicator App',
        featureKey: [AnalyticsFeatures.FEATURE_INDICATOR, AnalyticsFeatures.FEATURE_INDICATOR_APP],
        permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_VIEW]
      }
    },
    {
      title: 'Settings',
      matIcon: 'settings',
      link: '/settings',
      admin: true,
      data: {
        translationKey: 'Settings',
        featureKey: FeatureEnum.FEATURE_SETTING
      },
      children: [
        {
          title: 'Account',
          matIcon: 'account_circle',
          link: '/settings/account',
          data: {
            translationKey: 'Account'
          }
        },
        {
          title: 'AI Copilot',
          matIcon: 'psychology',
          link: '/settings/copilot',
          data: {
            translationKey: 'AI Copilot',
            permissionKeys: [AIPermissionsEnum.COPILOT_EDIT],
            featureKey: AiFeatureEnum.FEATURE_COPILOT
          }
        },
        // {
        //   title: 'Knowledgebase',
        //   matIcon: 'school',
        //   link: '/settings/knowledgebase',
        //   data: {
        //     translationKey: 'Knowledgebase',
        //     permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN],
        //     featureKey: AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE
        //   }
        // },
        {
          title: 'Data Sources',
          matIcon: 'database',
          link: '/settings/data-sources',
          admin: true,
          data: {
            translationKey: 'Data Sources',
            permissionKeys: [AnalyticsPermissionsEnum.DATA_SOURCE_EDIT],
            featureKey: AnalyticsFeatures.FEATURE_MODEL
          }
        },
        {
          title: 'Chat BI',
          matIcon: 'try',
          link: '/settings/chatbi',
          data: {
            translationKey: 'Chat BI',
            permissionKeys: [AIPermissionsEnum.XPERT_EDIT],
            featureKey: [AiFeatureEnum.FEATURE_XPERT, AnalyticsFeatures.FEATURE_MODEL]
          }
        },
        {
          title: 'User',
          matIcon: 'people',
          link: '/settings/users',
          data: {
            translationKey: 'User',
            permissionKeys: [PermissionsEnum.ORG_USERS_EDIT],
            featureKey: FeatureEnum.FEATURE_USER
          }
        },
        {
          title: 'Roles',
          matIcon: 'supervisor_account',
          link: '/settings/roles',
          data: {
            translationKey: 'Role & Permission',
            featureKey: FeatureEnum.FEATURE_ROLES_PERMISSION,
            permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
          }
        },
        {
          title: 'Business Area',
          matIcon: 'workspaces',
          link: '/settings/business-area',
          pathMatch: 'prefix',
          data: {
            translationKey: 'Business Area',
            featureKey: AnalyticsFeatures.FEATURE_BUSINESS_AREA,
            permissionKeys: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT]
          }
        },
        {
          title: 'Certification',
          matIcon: 'verified_user',
          link: '/settings/certification',
          pathMatch: 'prefix',
          data: {
            translationKey: 'Certification',
            // 同语义模型的功能绑定一起启用与否
            featureKey: AnalyticsFeatures.FEATURE_MODEL,
            permissionKeys: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT]
          }
        },
        {
          title: 'Integration',
          matIcon: 'hub',
          link: '/settings/integration',
          pathMatch: 'prefix',
          data: {
            translationKey: 'System Integration',
            featureKey: FeatureEnum.FEATURE_INTEGRATION,
            permissionKeys: [PermissionsEnum.INTEGRATION_EDIT]
          }
        },

        {
          title: 'Email Templates',
          matIcon: 'email',
          link: '/settings/email-templates',
          data: {
            translationKey: 'Email Template',
            permissionKeys: [PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES],
            featureKey: FeatureEnum.FEATURE_EMAIL_TEMPLATE
          }
        },
        {
          title: 'Custom SMTP',
          matIcon: 'alternate_email',
          link: '/settings/custom-smtp',
          data: {
            translationKey: 'Custom SMTP',
            permissionKeys: [PermissionsEnum.CUSTOM_SMTP_VIEW],
            featureKey: FeatureEnum.FEATURE_SMTP
          }
        },
        {
          title: 'Features',
          matIcon: 'widgets',
          link: '/settings/features',
          data: {
            translationKey: 'Feature',
            permissionKeys: [RolesEnum.SUPER_ADMIN]
          }
        },
        {
          title: 'Organizations',
          matIcon: 'corporate_fare',
          link: '/settings/organizations',
          data: {
            translationKey: 'Organization',
            permissionKeys: [RolesEnum.SUPER_ADMIN]
          }
        },
        {
          title: 'Plugins',
          matIcon: 'extension',
          link: '/settings/plugins',
          data: {
            translationKey: 'Plugins',
            permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL]
          }
        },
        ...(org
          ? []
          : [
              {
                title: 'Tenant',
                matIcon: 'storage',
                link: '/settings/tenant',
                data: {
                  translationKey: 'Tenant',
                  permissionKeys: [RolesEnum.SUPER_ADMIN]
                }
              }
            ])
      ]
    }
  ]
}
