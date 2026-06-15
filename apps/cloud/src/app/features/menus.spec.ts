import { RequestScopeLevel } from '../@core/types'
import { getSettingsMenuItems } from './menus'

describe('getSettingsMenuItems', () => {
  it('marks legacy settings menus as deprecated', () => {
    const deprecatedPaths = ['chatbi', 'business-area', 'certification']
    const menus = getSettingsMenuItems(RequestScopeLevel.ORGANIZATION)

    for (const path of deprecatedPaths) {
      expect(menus.find((item) => item.path === path)?.deprecated).toBe(true)
    }
  })
})
