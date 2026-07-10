import { CloudMenuItem } from './cloud-sidebar-menu.types'

export type CloudSidebarMenuGroupKey = 'work' | 'modules' | 'management'

export interface CloudSidebarMenuEntry {
  kind: 'menu' | 'assistants'
  item: CloudMenuItem | null
}

export interface CloudSidebarMenuGroup {
  key: CloudSidebarMenuGroupKey
  titleKey: string
  titleDefault: string
  items: CloudMenuItem[]
  entries: CloudSidebarMenuEntry[]
}

const CHAT_TASKS_MENU_PATH = '/chat/tasks'
const MANAGEMENT_MENU_ORDER = [
  '/plugins',
  '/operations',
  '/copilot/basic',
  '/settings/xpert-access-requests',
  '/settings'
] as const

export function buildCloudSidebarMenuGroups(menus: CloudMenuItem[]): CloudSidebarMenuGroup[] {
  const visibleMenus = (menus ?? []).filter((menu) => !menu.hidden)
  const managementMenus = visibleMenus
    .filter(isManagementCloudMenuItem)
    .sort((a, b) => managementMenuRank(a) - managementMenuRank(b))
  const assistantTrailingWorkMenus = visibleMenus.filter(isAssistantTrailingWorkMenuItem)
  const workMenus = visibleMenus.filter((item) => isWorkCloudMenuItem(item) && !isAssistantTrailingWorkMenuItem(item))
  const moduleMenus = visibleMenus.filter((item) => !isWorkCloudMenuItem(item) && !isManagementCloudMenuItem(item))

  const groups: CloudSidebarMenuGroup[] = [
    {
      key: 'work',
      titleKey: 'PAC.MenuGroup.WorkEntries',
      titleDefault: 'Work',
      items: [...workMenus, ...assistantTrailingWorkMenus],
      entries: [
        ...workMenus.map(createMenuEntry),
        { kind: 'assistants', item: null },
        ...assistantTrailingWorkMenus.map(createMenuEntry)
      ]
    },
    {
      key: 'modules',
      titleKey: 'PAC.MenuGroup.FeatureModules',
      titleDefault: 'Features',
      items: moduleMenus,
      entries: moduleMenus.map(createMenuEntry)
    },
    {
      key: 'management',
      titleKey: 'PAC.MenuGroup.Management',
      titleDefault: 'Management',
      items: managementMenus,
      entries: managementMenus.map(createMenuEntry)
    }
  ]

  return groups.filter((group) => group.items.length)
}

export function isExternalCloudMenuItem(item: CloudMenuItem) {
  return item.external === true || /^https?:\/\//i.test(item.link ?? '')
}

export function isCloudMenuRouteSuppressed(currentUrl: string, item: CloudMenuItem) {
  const inactivePathPrefixes = item.data?.inactivePathPrefixes

  return (
    Array.isArray(inactivePathPrefixes) &&
    inactivePathPrefixes.some(
      (prefix) => typeof prefix === 'string' && (currentUrl === prefix || currentUrl.startsWith(`${prefix}/`))
    )
  )
}

export function isCloudMenuRouteForcedActive(currentUrl: string, item: CloudMenuItem) {
  const activePathPrefixes = item.data?.activePathPrefixes

  return (
    Array.isArray(activePathPrefixes) &&
    activePathPrefixes.some(
      (prefix) => typeof prefix === 'string' && (currentUrl === prefix || currentUrl.startsWith(`${prefix}/`))
    )
  )
}

function isWorkCloudMenuItem(item: CloudMenuItem) {
  const path = readMenuPath(item)
  return path === '/chat' || path === '/chat/clawxpert' || isAssistantTrailingWorkMenuItem(item)
}

function isAssistantTrailingWorkMenuItem(item: CloudMenuItem) {
  return readMenuPath(item) === CHAT_TASKS_MENU_PATH
}

function isManagementCloudMenuItem(item: CloudMenuItem) {
  const path = readMenuPath(item)
  return item.admin === true || MANAGEMENT_MENU_ORDER.includes(path as (typeof MANAGEMENT_MENU_ORDER)[number])
}

function managementMenuRank(item: CloudMenuItem) {
  const index = MANAGEMENT_MENU_ORDER.indexOf(readMenuPath(item) as (typeof MANAGEMENT_MENU_ORDER)[number])
  if (index >= 0) {
    return index
  }

  return item.admin ? MANAGEMENT_MENU_ORDER.length : MANAGEMENT_MENU_ORDER.length + 1
}

function readMenuPath(item: CloudMenuItem) {
  return normalizeMenuPath(item.link ?? '')
}

export function normalizeMenuPath(path: string) {
  const [pathname] = path.split('?')
  const normalized = (pathname || '').replace(/\/+$/, '')

  return normalized || pathname || ''
}

function createMenuEntry(item: CloudMenuItem): CloudSidebarMenuEntry {
  return {
    kind: 'menu',
    item
  }
}
