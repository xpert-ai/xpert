import {
  addWorkspaceConnectorMenuItem,
  addWorkspaceExpertSkillsConnectorsMenuItem,
  addWorkspaceMoreMenuItem,
  addWorkspaceSkillMenuItem,
  buildWorkspaceModuleMenuLink,
  buildCloudSidebarMenuGroups,
  getWorkspaceModuleSection,
  isCloudMenuRouteForcedActive,
  isCloudMenuRouteSuppressed,
  isCloudMarketplaceHubRoute,
  isCloudWorkspaceShellMenuItem,
  isCloudWorkspaceStandaloneRoute,
  isExternalCloudMenuItem
} from './cloud-sidebar-menu.utils'
import { CloudMenuItem } from './cloud-sidebar-menu.types'

function menu(item: Partial<CloudMenuItem>): CloudMenuItem {
  return {
    title: item.title ?? item.link ?? 'Untitled',
    link: item.link,
    icon: item.icon,
    external: item.external,
    admin: item.admin,
    hidden: item.hidden,
    data: item.data ?? {},
    children: item.children
  }
}

describe('buildCloudSidebarMenuGroups', () => {
  it('groups work, module and management menus with fixed management order', () => {
    const groups = buildCloudSidebarMenuGroups([
      menu({ title: 'Tasks', link: '/chat/clawxpert' }),
      menu({ title: 'Scheduled', link: '/chat/tasks' }),
      menu({ title: 'Settings', link: '/settings', admin: true }),
      menu({ title: 'Data', link: '/data' }),
      menu({ title: 'MCP Management', link: '/operations' }),
      menu({ title: 'Plugins', link: '/plugins' }),
      menu({ title: 'Model Providers', link: '/copilot/basic', admin: true }),
      menu({ title: 'Xpert Access Requests', link: '/xpert-access-requests', admin: true }),
      menu({ title: 'Explore', link: '/explore' })
    ])

    expect(groups.map((group) => group.key)).toEqual(['work', 'modules', 'management'])
    expect(groups.find((group) => group.key === 'work')?.items.map((item) => item.link)).toEqual([
      '/chat/clawxpert',
      '/chat/tasks'
    ])
    expect(
      groups
        .find((group) => group.key === 'work')
        ?.entries.map((entry) => (entry.item ? entry.item.link : 'assistants'))
    ).toEqual(['/chat/clawxpert', '/chat/tasks', 'assistants'])
    expect(groups.find((group) => group.key === 'modules')?.items.map((item) => item.link)).toEqual([
      '/data',
      '/explore'
    ])
    expect(groups.find((group) => group.key === 'management')?.items.map((item) => item.link)).toEqual([
      '/plugins',
      '/operations',
      '/copilot/basic',
      '/xpert-access-requests',
      '/settings'
    ])
  })

  it('filters hidden items before grouping', () => {
    const groups = buildCloudSidebarMenuGroups([
      menu({ title: 'Chat', link: '/chat', hidden: true }),
      menu({ title: 'Data', link: '/data' }),
      menu({ title: 'Settings', link: '/settings', admin: true, hidden: true })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: 'modules',
      items: [{ link: '/data' }]
    })
  })

  it('places the scheduled task menu above the assistant slot when it is the only work entry', () => {
    const groups = buildCloudSidebarMenuGroups([menu({ title: 'Scheduled', link: '/chat/tasks' })])

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('work')
    expect(groups[0].entries.map((entry) => (entry.item ? entry.item.link : 'assistants'))).toEqual([
      '/chat/tasks',
      'assistants'
    ])
  })

  it('adds the current workspace connector entry after new task', () => {
    const groups = buildCloudSidebarMenuGroups([
      menu({ title: 'New task', link: '/chat/clawxpert/c' }),
      menu({ title: 'Scheduled', link: '/chat/tasks' }),
      menu({ title: 'Workspace', link: '/xpert' }),
      menu({ title: 'Explore', link: '/explore' })
    ])

    const updated = addWorkspaceConnectorMenuItem(groups, 'workspace/1')
    const work = updated.find((group) => group.key === 'work')

    expect(work?.items.map((item) => item.link)).toEqual([
      '/chat/clawxpert/c',
      '/xpert/w/workspace%2F1/clawxpert-connectors',
      '/chat/tasks'
    ])
    expect(work?.items[1]).toMatchObject({
      title: '连接器',
      icon: 'ri-share-line',
      pathMatch: 'prefix',
      data: { translationKey: 'Connectors', workspaceSection: 'connectors' }
    })
  })

  it('keeps the connector entry visible while the selected workspace is loading', () => {
    const groups = buildCloudSidebarMenuGroups([menu({ title: 'New task', link: '/chat/clawxpert/c' })])

    expect(addWorkspaceConnectorMenuItem(groups).find((group) => group.key === 'work')?.items).toMatchObject([
      {
        title: 'New task',
        link: '/chat/clawxpert/c'
      },
      {
        title: '连接器',
        link: '/xpert/w?section=connectors'
      }
    ])
  })

  it('keeps skills and connectors visible before a workspace has been selected', () => {
    const withConnector = addWorkspaceConnectorMenuItem([])
    const updated = addWorkspaceSkillMenuItem(withConnector)
    const work = updated.find((group) => group.key === 'work')

    expect(work?.items.map((item) => item.link)).toEqual(['/xpert/w?section=skills', '/xpert/w?section=connectors'])
    expect(work?.entries.at(-1)).toEqual({ kind: 'assistants', item: null })
  })

  it('keeps workspace modules visible when the work menu has no permission-gated entries', () => {
    const groups = buildCloudSidebarMenuGroups([])

    const withConnector = addWorkspaceConnectorMenuItem(groups, 'workspace/1')
    const updated = addWorkspaceSkillMenuItem(withConnector, 'workspace/1')
    const work = updated.find((group) => group.key === 'work')

    expect(work?.items.map((item) => item.link)).toEqual([
      '/xpert/w/workspace%2F1/clawxpert-skills',
      '/xpert/w/workspace%2F1/clawxpert-connectors'
    ])
    expect(work?.entries.at(-1)).toEqual({ kind: 'assistants', item: null })
  })

  it('adds the current workspace skills entry before the connector entry', () => {
    const groups = buildCloudSidebarMenuGroups([
      menu({ title: 'New task', link: '/chat/clawxpert/c' }),
      menu({ title: 'Scheduled', link: '/chat/tasks' })
    ])

    const withConnector = addWorkspaceConnectorMenuItem(groups, 'workspace/1')
    const updated = addWorkspaceSkillMenuItem(withConnector, 'workspace/1')
    const work = updated.find((group) => group.key === 'work')

    expect(work?.items.map((item) => item.link)).toEqual([
      '/chat/clawxpert/c',
      '/xpert/w/workspace%2F1/clawxpert-skills',
      '/xpert/w/workspace%2F1/clawxpert-connectors',
      '/chat/tasks'
    ])
    expect(work?.items[0]).toMatchObject({
      title: 'New task',
      link: '/chat/clawxpert/c'
    })
    expect(work?.items[1]).toMatchObject({
      title: '技能',
      icon: 'ri-pencil-ruler-line',
      pathMatch: 'prefix',
      data: { translationKey: 'Skills', workspaceSection: 'skills' }
    })
  })

  it('adds the Data Xpert-style more section with independent workspace pages', () => {
    const groups = buildCloudSidebarMenuGroups([
      menu({ title: 'New task', link: '/chat/clawxpert/c' }),
      menu({ title: 'Scheduled', link: '/chat/tasks' })
    ])

    const updated = addWorkspaceMoreMenuItem(
      addWorkspaceSkillMenuItem(addWorkspaceConnectorMenuItem(groups, 'workspace/1'), 'workspace/1'),
      'workspace/1'
    )
    const work = updated.find((group) => group.key === 'work')
    const more = work?.items.find((item) => item.data?.translationKey === 'More')

    expect(work?.items.map((item) => item.data?.workspaceSection ?? item.data?.translationKey ?? item.link)).toEqual([
      '/chat/clawxpert/c',
      'skills',
      'connectors',
      '/chat/tasks',
      'More'
    ])
    expect(more?.children).toMatchObject([
      { title: '资源库', link: '/xpert/w/workspace%2F1/files', data: { workspaceSection: 'files' } },
      {
        title: '我的知识库',
        link: '/xpert/knowledges',
        data: { translationKey: 'My knowledgebases' }
      },
      { title: '工作区设置', link: '/chat/clawxpert', data: { workspaceSection: 'settings' } }
    ])
  })

  it('merges the marketplace entry and removes the old explore menu item', () => {
    const groups = buildCloudSidebarMenuGroups([
      menu({ title: 'New task', link: '/chat/clawxpert/c' }),
      menu({ title: 'Explore', link: '/explore' }),
      menu({ title: 'Data', link: '/data' })
    ])

    const updated = addWorkspaceExpertSkillsConnectorsMenuItem(groups)
    const work = updated.find((group) => group.key === 'work')

    expect(work?.items.map((item) => item.data?.translationKey ?? item.link)).toEqual([
      '/chat/clawxpert/c',
      'ExpertSkillsConnectors'
    ])
    expect(updated.find((group) => group.key === 'modules')?.items.map((item) => item.link)).toEqual(['/data'])
    expect(work?.items[1]).toMatchObject({
      title: '专家·技能·连接器',
      link: '/explore',
      data: { translationKey: 'ExpertSkillsConnectors' }
    })
  })
})

describe('cloud sidebar menu helpers', () => {
  it('builds independent workspace module links without using task or conversation routes', () => {
    expect(buildWorkspaceModuleMenuLink('skills', 'workspace/1')).toBe('/xpert/w/workspace%2F1/clawxpert-skills')
    expect(buildWorkspaceModuleMenuLink('connectors', 'workspace/1')).toBe(
      '/xpert/w/workspace%2F1/clawxpert-connectors'
    )
    expect(buildWorkspaceModuleMenuLink('skills')).toBe('/xpert/w?section=skills')
    expect(buildWorkspaceModuleMenuLink('connectors')).toBe('/xpert/w?section=connectors')
    expect(buildWorkspaceModuleMenuLink('files', 'workspace/1')).toBe('/xpert/w/workspace%2F1/files')
    expect(buildWorkspaceModuleMenuLink('knowledges', 'workspace/1')).toBe(
      '/xpert/w/workspace%2F1/clawxpert-knowledges'
    )
    expect(buildWorkspaceModuleMenuLink('settings', 'workspace/1')).toBe('/chat/clawxpert')
    expect(buildWorkspaceModuleMenuLink('settings')).toBe('/chat/clawxpert')
    expect(getWorkspaceModuleSection(menu({ data: { workspaceSection: 'skills' }, link: '/chat/clawxpert/c' }))).toBe(
      'skills'
    )
  })

  it('keeps standalone workspace modules out of the parent workspace active state', () => {
    expect(isCloudWorkspaceStandaloneRoute('/xpert/w/workspace-1/clawxpert-connectors')).toBe(true)
    expect(isCloudWorkspaceStandaloneRoute('/xpert/w/workspace-1/clawxpert-skills')).toBe(true)
    expect(isCloudWorkspaceStandaloneRoute('/xpert/w/workspace-1/clawxpert-knowledges')).toBe(true)
    expect(isCloudWorkspaceStandaloneRoute('/xpert/w/workspace-1')).toBe(false)
    expect(isCloudWorkspaceShellMenuItem(menu({ link: '/xpert' }))).toBe(true)
    expect(isCloudWorkspaceShellMenuItem(menu({ link: '/xpert/w/workspace-1' }))).toBe(false)
  })

  it('recognizes the shared marketplace hub and its standalone pages', () => {
    expect(isCloudMarketplaceHubRoute('/explore')).toBe(true)
    expect(isCloudMarketplaceHubRoute('/explore?tab=skills')).toBe(true)
    expect(isCloudMarketplaceHubRoute('/xpert/w/workspace-1/clawxpert-skills')).toBe(true)
    expect(isCloudMarketplaceHubRoute('/xpert/w/workspace-1/clawxpert-connectors')).toBe(true)
    expect(isCloudMarketplaceHubRoute('/xpert/w/workspace-1')).toBe(false)
  })

  it('detects external links from either the flag or URL', () => {
    expect(isExternalCloudMenuItem(menu({ link: '/chat' }))).toBe(false)
    expect(isExternalCloudMenuItem(menu({ link: '/x', external: true }))).toBe(true)
    expect(isExternalCloudMenuItem(menu({ link: 'https://code.xpertai.cn/' }))).toBe(true)
  })

  it('suppresses route active state for inactive path prefixes', () => {
    const chat = menu({
      link: '/chat',
      data: {
        inactivePathPrefixes: ['/chat/tasks']
      }
    })

    expect(isCloudMenuRouteSuppressed('/chat/x/common/c', chat)).toBe(false)
    expect(isCloudMenuRouteSuppressed('/chat/tasks', chat)).toBe(true)
    expect(isCloudMenuRouteSuppressed('/chat/tasks/task-id', chat)).toBe(true)
  })

  it('forces route active state for configured active path prefixes', () => {
    const recent = menu({
      link: '/chat',
      data: {
        activePathPrefixes: ['/chat/c']
      }
    })

    expect(isCloudMenuRouteForcedActive('/chat/c/conversation-id', recent)).toBe(true)
    expect(isCloudMenuRouteForcedActive('/chat/x/common', recent)).toBe(false)
  })
})
