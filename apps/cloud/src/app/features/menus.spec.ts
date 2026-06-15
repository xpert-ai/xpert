import { AiFeatureEnum, AIPermissionsEnum, RequestScopeLevel } from '../@core/types'
import { getFeatureMenus, getSettingsMenuItems } from './menus'

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
})

describe('getFeatureMenus', () => {
  it('promotes plugins to the bottom top-level Xpert-gated menu item', () => {
    const menus = getFeatureMenus(RequestScopeLevel.ORGANIZATION, null)
    const plugins = menus.find((item) => item.link === '/plugins')

    expect(plugins).toMatchObject({
      title: 'Plugins',
      icon: 'ri-puzzle-2-line',
      pathMatch: 'prefix',
      scopeContext: 'dual-scope'
    })
    expect(menus.at(-1)?.link).toBe('/plugins')
    expect(plugins?.data?.featureKey).toBe(AiFeatureEnum.FEATURE_XPERT)
    expect(plugins?.data?.permissionKeys).toEqual([AIPermissionsEnum.XPERT_EDIT])
  })
})
