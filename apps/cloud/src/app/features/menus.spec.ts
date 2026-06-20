import {
  AiFeatureEnum,
  AIPermissionsEnum,
  AnalyticsFeatures,
  FeatureEnum,
  RequestScopeLevel,
  RolesEnum
} from '../@core/types'
import { getFeatureMenus, getSettingsMenuItems, syncMenuParentStateFromChildren } from './menus'

describe('getSettingsMenuItems', () => {
  it('marks legacy settings menus as deprecated', () => {
    const deprecatedPaths = ['chatbi', 'business-area', 'certification']
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)

    for (const path of deprecatedPaths) {
      expect(menus.find((item) => item.path === path)?.deprecated).toBe(true)
    }
  })

  it('removes plugins from the settings menu after promotion', () => {
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)

    expect(menus.find((item) => item.path === 'plugins')).toBeUndefined()
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

    expect(dataSources?.data?.featureKey).toBe(AnalyticsFeatures.FEATURE_DATA_SOURCE)
  })
})

describe('getFeatureMenus', () => {
  it('promotes plugins to a top-level Xpert-gated menu item', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const plugins = menus.find((item) => item.link === '/plugins')

    expect(plugins).toMatchObject({
      title: 'Plugins',
      icon: 'ri-puzzle-2-line',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope'
    })
    expect(plugins?.data?.featureKey).toBe(AiFeatureEnum.FEATURE_XPERT)
    expect(plugins?.data?.permissionKeys).toEqual([AIPermissionsEnum.XPERT_EDIT])
  })

  it('adds Operations beside Plugins for super admins', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const pluginIndex = menus.findIndex((item) => item.link === '/plugins')
    const operations = menus.find((item) => item.link === '/operations')

    expect(pluginIndex).toBeGreaterThanOrEqual(0)
    expect(menus[pluginIndex + 1]?.link).toBe('/operations')
    expect(operations).toMatchObject({
      title: 'Operations',
      icon: 'ri-pulse-line',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope'
    })
    expect(operations?.data?.permissionKeys).toEqual([RolesEnum.SUPER_ADMIN])
  })

  it('points the Data parent menu at the first visible child menu', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const data = menus.find((item) => item.title === 'Data')

    data!.children![0].hidden = true
    data!.children![1].hidden = false
    syncMenuParentStateFromChildren(data!)

    expect(data?.hidden).toBe(false)
    expect(data?.link).toBe('/data/models')
  })

  it('hides the Data parent menu when all child menus are hidden', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const data = menus.find((item) => item.title === 'Data')

    data!.children!.forEach((item) => {
      item.hidden = true
    })
    syncMenuParentStateFromChildren(data!)

    expect(data?.hidden).toBe(true)
  })
})
