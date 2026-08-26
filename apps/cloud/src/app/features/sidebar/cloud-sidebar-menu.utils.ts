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

export type CloudWorkspaceModuleSection = 'skills' | 'connectors' | 'files' | 'knowledges' | 'settings'

const CHAT_TASKS_MENU_PATH = '/chat/tasks'
const MANAGEMENT_MENU_ORDER = [
  '/plugins',
  '/operations',
  '/copilot/basic',
  '/xpert-access-requests',
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
      titleKey: 'XP.MenuGroup.WorkEntries',
      titleDefault: 'Work',
      items: [...workMenus, ...assistantTrailingWorkMenus],
      entries: [
        ...workMenus.map(createMenuEntry),
        ...assistantTrailingWorkMenus.map(createMenuEntry),
        { kind: 'assistants', item: null }
      ]
    },
    {
      key: 'modules',
      titleKey: 'XP.MenuGroup.FeatureModules',
      titleDefault: 'Features',
      items: moduleMenus,
      entries: moduleMenus.map(createMenuEntry)
    },
    {
      key: 'management',
      titleKey: 'XP.MenuGroup.Management',
      titleDefault: 'Management',
      items: managementMenus,
      entries: managementMenus.map(createMenuEntry)
    }
  ]

  return groups.filter((group) => group.items.length)
}

export function addWorkspaceConnectorMenuItem(groups: CloudSidebarMenuGroup[], workspaceId?: string | null) {
  const normalizedWorkspaceId = workspaceId?.trim()

  const connector: CloudMenuItem = {
    title: '连接器',
    icon: 'ri-share-line',
    link: buildWorkspaceModuleMenuLink('connectors', normalizedWorkspaceId),
    pathMatch: 'prefix',
    data: {
      translationKey: 'Connectors',
      workspaceSection: 'connectors'
    }
  }

  const workGroups = ensureWorkMenuGroup(groups)

  return workGroups.map((group) => {
    if (
      group.key !== 'work' ||
      group.items.some((item) => item.data?.translationKey === connector.data?.translationKey)
    ) {
      return group
    }

    return sortWorkMenuGroup(group, connector)
  })
}

export function addWorkspaceSkillMenuItem(groups: CloudSidebarMenuGroup[], workspaceId?: string | null) {
  const normalizedWorkspaceId = workspaceId?.trim()

  const skill: CloudMenuItem = {
    title: '技能',
    icon: 'ri-pencil-ruler-line',
    link: buildWorkspaceModuleMenuLink('skills', normalizedWorkspaceId),
    pathMatch: 'prefix',
    data: {
      translationKey: 'Skills',
      workspaceSection: 'skills'
    }
  }

  const workGroups = ensureWorkMenuGroup(groups)

  return workGroups.map((group) => {
    if (group.key !== 'work' || group.items.some((item) => item.data?.translationKey === skill.data?.translationKey)) {
      return group
    }

    return sortWorkMenuGroup(group, skill)
  })
}

export function addWorkspaceMoreMenuItem(groups: CloudSidebarMenuGroup[], workspaceId?: string | null) {
  const normalizedWorkspaceId = workspaceId?.trim()
  const more: CloudMenuItem = {
    title: '更多',
    icon: 'ri-apps-2-line',
    data: {
      translationKey: 'More'
    },
    children: [
      createWorkspaceChild('资源库', 'Library', 'ri-book-open-line', 'files', normalizedWorkspaceId),
      createWorkspaceChild('我的知识库', 'My knowledgebases', 'ri-book-2-line', 'knowledges', normalizedWorkspaceId),
      createWorkspaceChild('工作区设置', 'Workspace settings', 'ri-equalizer-line', 'settings', normalizedWorkspaceId)
    ]
  }

  return ensureWorkMenuGroup(groups).map((group) => {
    if (group.key !== 'work' || group.items.some((item) => item.data?.translationKey === 'More')) {
      return group
    }

    return sortWorkMenuGroup(group, more)
  })
}

export function getWorkspaceModuleSection(item: CloudMenuItem): CloudWorkspaceModuleSection | null {
  const section = item.data?.workspaceSection
  return section === 'skills' ||
    section === 'connectors' ||
    section === 'files' ||
    section === 'knowledges' ||
    section === 'settings'
    ? section
    : null
}

export function isNewClawXpertTaskMenuItem(item: CloudMenuItem) {
  return item.data?.action === 'newClawXpertConversation'
}

export function buildWorkspaceModuleMenuLink(section: CloudWorkspaceModuleSection, workspaceId?: string | null) {
  const normalizedWorkspaceId = workspaceId?.trim()
  return normalizedWorkspaceId
    ? `/xpert/w/${encodeURIComponent(normalizedWorkspaceId)}/${section}`
    : `/xpert/w?section=${section}`
}

function ensureWorkMenuGroup(groups: CloudSidebarMenuGroup[]) {
  if (groups.some((group) => group.key === 'work')) {
    return groups
  }

  return [
    {
      key: 'work' as const,
      titleKey: 'XP.MenuGroup.WorkEntries',
      titleDefault: 'Work',
      items: [],
      entries: [{ kind: 'assistants' as const, item: null }]
    },
    ...groups
  ]
}

function createWorkspaceChild(
  title: string,
  translationKey: string,
  icon: string,
  section: CloudWorkspaceModuleSection,
  workspaceId?: string | null
): CloudMenuItem {
  return {
    title,
    icon,
    link: buildWorkspaceModuleMenuLink(section, workspaceId),
    pathMatch: 'prefix',
    data: {
      translationKey,
      workspaceSection: section
    }
  }
}

function sortWorkMenuGroup(group: CloudSidebarMenuGroup, item: CloudMenuItem): CloudSidebarMenuGroup {
  const items = [...group.items, item].sort((a, b) => workMenuRank(a) - workMenuRank(b))
  const menuEntries = group.entries.filter((entry) => entry.item)
  const assistantEntries = group.entries.filter((entry) => !entry.item)
  const entries = [...menuEntries, { kind: 'menu' as const, item }]
    .sort((a, b) => workMenuRank(a.item) - workMenuRank(b.item))
    .concat(assistantEntries)

  return { ...group, items, entries }
}

function workMenuRank(item: CloudMenuItem | null) {
  const path = item?.link ?? ''
  if (item?.data?.action === 'newClawXpertConversation' || path === '/chat/clawxpert/c') {
    return 0
  }
  if (item?.data?.workspaceSection === 'skills') {
    return 1
  }
  if (item?.data?.workspaceSection === 'connectors') {
    return 2
  }
  if (path === '/chat/tasks') {
    return 3
  }
  if (item?.data?.translationKey === 'More') {
    return 4
  }
  return 5
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
  return (
    path === '/chat' ||
    path === '/chat/clawxpert' ||
    path.startsWith('/chat/clawxpert/c') ||
    isAssistantTrailingWorkMenuItem(item)
  )
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
