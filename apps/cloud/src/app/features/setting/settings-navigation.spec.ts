import type { SettingsMenuItem } from '../menus'
import { buildSettingsNavigation, findSettingsNavigationItem } from './settings-navigation'

const account: SettingsMenuItem = { path: 'account', label: 'Account', icon: 'user' }
const access = { membership: true, models: true, gateway: true }

describe('settings navigation', () => {
  it('retains only the supplied management entries, including extension menus', () => {
    const allowed: SettingsMenuItem[] = [
      account,
      { path: 'users', label: 'Users', icon: 'users' },
      { path: 'features/organization', label: 'Features', icon: 'settings' },
      { path: 'extension-settings', label: 'Extension', icon: 'plug', data: { translationKey: 'Custom.Settings' } }
    ]
    const groups = buildSettingsNavigation(allowed, access)
    const management = groups.flatMap((group) => group.items).filter((item) => !item.path.startsWith('account/'))
    expect(management.map((item) => item.path).sort()).toEqual(
      allowed
        .slice(1)
        .map((item) => item.path)
        .sort()
    )
    expect(groups.find((group) => group.key === 'Extensions')?.items[0].translationKey).toBe('Custom.Settings')
  })

  it('keeps account capabilities independent when flattening the old tabs', () => {
    const paths = (flags: typeof access) =>
      buildSettingsNavigation([account], flags).flatMap((group) => group.items.map((item) => item.path))
    expect(paths({ membership: false, models: true, gateway: false })).toEqual([
      'account/models',
      'account/profile',
      'account/password'
    ])
    expect(paths({ membership: true, models: false, gateway: false })).toEqual([
      'account/usage',
      'account/billing',
      'account/profile',
      'account/password'
    ])
    expect(paths(access)).toContain('account/api')
  })

  it('does not reintroduce missing or empty groups', () => {
    expect(buildSettingsNavigation([], access)).toEqual([])
    expect(buildSettingsNavigation([account], access).map((group) => group.key)).toEqual(['Personal'])
  })

  it('retains active parent navigation on detail URLs without matching unrelated prefixes', () => {
    const groups = buildSettingsNavigation([{ path: 'users', label: 'Users', icon: 'users' }], access)
    expect(findSettingsNavigationItem(groups, 'users/user-id/security')?.path).toBe('users')
    expect(findSettingsNavigationItem(groups, 'users-other')).toBeUndefined()
  })
})
