import {
  AiFeatureEnum,
  AIPermissionsEnum,
  FeatureEnum,
  PermissionsEnum,
  RequestScopeLevel,
  RolesEnum
} from '../@core/types'
import { environment } from '../../environments/environment'
import { getFeatureMenus, getSettingsMenuItems } from './menus'

describe('getSettingsMenuItems', () => {
  it('removes legacy Analytics settings menus', () => {
    const removedPaths = ['chatbi', 'business-area', 'certification']
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)

    for (const path of removedPaths) {
      expect(menus.find((item) => item.path === path)).toBeUndefined()
    }
  })

  it('removes plugins from the settings menu after promotion', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)

    expect(menus.find((item) => item.path === 'plugins')).toBeUndefined()
  })

  it('removes model providers from the settings menu after promotion', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)

    expect(menus.find((item) => item.path === 'copilot')).toBeUndefined()
  })

  it('removes xpert access requests from the settings menu after management promotion', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)

    expect(menus.find((item) => item.path === 'xpert-access-requests')).toBeUndefined()
  })

  it('gates the organization settings menu with the organization feature', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)
    const organizations = menus.find((item) => item.path === 'organizations')

    expect(organizations?.data?.featureKey).toBe(FeatureEnum.FEATURE_ORGANIZATION)
  })

  it('gates user and group settings with separate user child features', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)
    const users = menus.find((item) => item.path === 'users')
    const groups = menus.find((item) => item.path === 'groups')

    expect(users?.data?.featureKey).toBe(FeatureEnum.FEATURE_USERS)
    expect(groups?.data?.featureKey).toBe(FeatureEnum.FEATURE_USER_GROUPS)
  })

  it('gates data sources settings with the data source feature', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)
    const dataSources = menus.find((item) => item.path === 'data-sources')

    expect(dataSources?.data?.featureKey).toBe(FeatureEnum.FEATURE_DATA_SOURCE)
    expect(dataSources?.data?.permissionKeys).toEqual([PermissionsEnum.DATA_SOURCE_EDIT])
  })

  it('gates membership settings with the membership plan feature', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)
    const membership = menus.find((item) => item.path === 'membership')

    expect(membership?.data?.featureKey).toBe(AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN)
    expect(membership?.data?.permissionKeys).toEqual([AIPermissionsEnum.MEMBERSHIP_EDIT])
  })

  it('includes settings menu extensions from the active environment', () => {
    const originalExtensions = environment.settingsExtensions
    environment.settingsExtensions = {
      menus: [
        {
          path: 'extension-settings',
          label: 'Extension settings',
          icon: 'extension',
          scopeContext: 'organization-only'
        }
      ]
    }

    try {
      expect(
        getSettingsMenuItems(RequestScopeLevel.ORGANIZATION).find((item) => item.path === 'extension-settings')
      ).toMatchObject({ scopeContext: 'organization-only' })
      expect(
        getSettingsMenuItems(RequestScopeLevel.TENANT).find((item) => item.path === 'extension-settings')
      ).toBeUndefined()
    } finally {
      environment.settingsExtensions = originalExtensions
    }
  })

  it('gates model access approvals with both features and view-or-edit permission', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)
    const modelAccess = menus.find((item) => item.path === 'model-access')

    expect(modelAccess?.data?.featureKey).toEqual([
      AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
      AiFeatureEnum.FEATURE_MODEL_ACCESS_REQUEST
    ])
    expect(modelAccess?.data?.permissionKeys).toEqual([
      AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW,
      AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT
    ])
  })

  it('shows scope-isolated model gateway management in tenant and organization settings', () => {
    const tenantGateway = getSettingsMenuItems(RequestScopeLevel.TENANT).find((item) => item.path === 'model-gateway')
    const organizationGateway = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION).find(
      (item) => item.path === 'model-gateway'
    )

    expect(tenantGateway).toMatchObject({
      icon: 'code-xml',
      scopeContext: 'dual-scope',
      data: {
        featureKey: AiFeatureEnum.FEATURE_MODEL_GATEWAY,
        permissionKeys: [AIPermissionsEnum.MODEL_GATEWAY_MANAGE]
      }
    })
    expect(organizationGateway).toMatchObject({
      scopeContext: 'dual-scope',
      data: {
        featureKey: AiFeatureEnum.FEATURE_MODEL_GATEWAY,
        permissionKeys: [AIPermissionsEnum.MODEL_GATEWAY_MANAGE]
      }
    })
  })

  it('exposes system integrations in tenant and organization settings', () => {
    const tenantIntegration = getSettingsMenuItems(RequestScopeLevel.TENANT).find((item) => item.path === 'integration')
    const organizationIntegration = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION).find(
      (item) => item.path === 'integration'
    )

    expect(tenantIntegration).toMatchObject({
      scopeContext: 'dual-scope',
      data: { permissionKeys: [PermissionsEnum.INTEGRATION_EDIT] }
    })
    expect(organizationIntegration).toMatchObject({
      scopeContext: 'dual-scope',
      data: { permissionKeys: [PermissionsEnum.INTEGRATION_EDIT] }
    })
  })
})

describe('getFeatureMenus', () => {
  it('promotes plugins to a top-level Xpert-gated menu item', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const plugins = menus.find((item) => item.link === '/plugins')

    expect(plugins).toMatchObject({
      title: 'Plugins',
      icon: 'ri-plug-line',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope'
    })
    expect(plugins?.data?.featureKey).toBe(AiFeatureEnum.FEATURE_XPERT)
    expect(plugins?.data?.permissionKeys).toEqual([AIPermissionsEnum.XPERT_EDIT])
    expect(plugins?.data?.onboardingTarget).toBe('plugins-marketplace')
  })

  it('keeps tasks as the only static chat sidebar entry', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const chat = menus.find((item) => item.link === '/chat')
    const tasks = menus.find((item) => item.link === '/chat/tasks')

    expect(chat).toBeUndefined()
    expect(tasks).toMatchObject({
      title: 'Scheduled',
      icon: 'ri-time-line',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope'
    })
    expect(tasks?.data?.translationKey).toBe('Scheduled')
  })

  it('adds MCP Monitor beside Plugins for super admins', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const pluginIndex = menus.findIndex((item) => item.link === '/plugins')
    const operations = menus.find((item) => item.link === '/operations')

    expect(pluginIndex).toBeGreaterThanOrEqual(0)
    expect(menus[pluginIndex + 1]?.link).toBe('/operations')
    expect(operations).toMatchObject({
      title: 'MCP Monitor',
      icon: 'ri-pulse-line',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope'
    })
    expect(operations?.data?.translationKey).toBe('MCP Monitor')
    expect(operations?.data?.permissionKeys).toEqual([RolesEnum.SUPER_ADMIN])
  })

  it('promotes model providers to the management menu with the original copilot gate', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const modelProviders = menus.find((item) => item.link === '/copilot/basic')

    expect(modelProviders).toMatchObject({
      title: 'Model Providers',
      icon: 'psychology',
      pathMatch: 'prefix',
      admin: true,
      scopeContext: 'dual-scope'
    })
    expect(modelProviders?.data?.translationKey).toBe('AI Copilot')
    expect(modelProviders?.data?.featureKey).toBe(AiFeatureEnum.FEATURE_COPILOT)
    expect(modelProviders?.data?.permissionKeys).toEqual([AIPermissionsEnum.COPILOT_EDIT])
    expect(modelProviders?.data?.activePathPrefixes).toEqual(['/copilot'])
    expect(modelProviders?.data?.onboardingTarget).toBe('model-providers')
  })

  it('promotes xpert access requests to the management menu with approval gates', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const requests = menus.find((item) => item.link === '/xpert-access-requests')

    expect(requests).toMatchObject({
      title: 'Xpert Access Requests',
      icon: 'approval',
      admin: true,
      scopeContext: 'organization-only'
    })
    expect(requests?.data?.translationKey).toBe('Xpert Access Requests')
    expect(requests?.data?.featureKey).toEqual([
      AiFeatureEnum.FEATURE_XPERT,
      AiFeatureEnum.FEATURE_XPERT_MARKETPLACE,
      FeatureEnum.FEATURE_USER_GROUPS
    ])
    expect(requests?.data?.permissionKeys).toEqual([RolesEnum.AI_BUILDER, RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN])
  })

  it('marks the workspace menu as an onboarding target', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const workspace = menus.find((item) => item.link === '/xpert')

    expect(workspace?.data?.onboardingTarget).toBe('workspace')
  })

  it('does not expose the removed Analytics Data menu', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const data = menus.find((item) => item.title === 'Data')

    expect(data).toBeUndefined()
  })
})
