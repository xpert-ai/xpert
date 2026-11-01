import type { SettingsMenuItem } from '../menus'

export interface SettingsNavigationItem {
  path: string
  label: string
  translationKey: string
  icon: string
  deprecated?: boolean
}

export interface SettingsNavigationGroup {
  key: string
  label: string
  items: SettingsNavigationItem[]
}

export function buildSettingsNavigation(
  menus: SettingsMenuItem[],
  account: { membership: boolean; models: boolean; gateway: boolean; personalApiKeys?: boolean }
): SettingsNavigationGroup[] {
  const personal: SettingsNavigationItem[] = [
    ...(account.membership
      ? [
          {
            path: 'account/usage',
            label: 'Usage overview',
            translationKey: 'XP.Membership.UsageOverview',
            icon: 'activity'
          },
          {
            path: 'account/billing',
            label: 'Usage & billing',
            translationKey: 'XP.Membership.UsageBilling',
            icon: 'credit-card'
          }
        ]
      : []),
    ...(account.models
      ? [
          {
            path: 'account/models',
            label: 'Available models',
            translationKey: 'XP.Membership.AllowedModels',
            icon: 'robot_2'
          }
        ]
      : []),
    ...(account.gateway
      ? [
          {
            path: 'account/api',
            label: 'External API',
            translationKey: 'XP.ModelGateway.ExternalApi',
            icon: 'code-xml'
          }
        ]
      : []),
    {
      path: 'account/profile',
      label: 'Personal information',
      translationKey: 'XP.KEY_WORDS.PersonalInformation',
      icon: 'user'
    },
    ...(account.personalApiKeys
      ? [
          {
            path: 'account/api-keys',
            label: 'Personal API keys',
            translationKey: 'XP.PersonalApiKeys.Title',
            icon: 'ri-key-2-line'
          }
        ]
      : []),
    { path: 'account/password', label: 'Password', translationKey: 'XP.KEY_WORDS.Password', icon: 'lock' }
  ]
  const groups: SettingsNavigationGroup[] = [
    { key: 'Personal', label: 'Personal', items: menus.some((item) => item.path === 'account') ? personal : [] },
    { key: 'People', label: 'People & organizations', items: [] },
    { key: 'Connections', label: 'AI & connections', items: [] },
    { key: 'Governance', label: 'Administration', items: [] },
    { key: 'Extensions', label: 'Extensions', items: [] }
  ]
  const groupPaths = {
    People: ['users', 'groups', 'business-area', 'organizations', 'referrals'],
    Connections: ['assistants', 'analytics', 'data-sources', 'integration', 'model-access', 'model-gateway'],
    Governance: [
      'announcements',
      'membership',
      'roles',
      'features/tenant',
      'features/organization',
      'email-templates',
      'tenant'
    ]
  }
  // The caller supplies already-authorized menus; grouping never adds management entries.
  for (const menu of menus.filter((item) => item.path !== 'account')) {
    const key = Object.entries(groupPaths).find(([, paths]) => paths.includes(menu.path))?.[0] ?? 'Extensions'
    groups
      .find((group) => group.key === key)
      ?.items.push({
        ...menu,
        translationKey: menu.data?.translationKey ?? 'XP.MENU.' + menu.label
      })
  }
  return groups.filter((group) => group.items.length)
}

export function findSettingsNavigationItem(groups: SettingsNavigationGroup[], path: string) {
  return groups.flatMap((group) => group.items).find((item) => path === item.path || path.startsWith(item.path + '/'))
}
