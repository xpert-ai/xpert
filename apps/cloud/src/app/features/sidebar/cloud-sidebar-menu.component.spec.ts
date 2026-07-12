import {
  buildCloudSidebarMenuGroups,
  isCloudMenuRouteForcedActive,
  isCloudMenuRouteSuppressed,
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
      menu({ title: 'MCP Monitor', link: '/operations' }),
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
    ).toEqual(['/chat/clawxpert', 'assistants', '/chat/tasks'])
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

  it('places the scheduled task menu below the assistant slot when it is the only work entry', () => {
    const groups = buildCloudSidebarMenuGroups([menu({ title: 'Scheduled', link: '/chat/tasks' })])

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('work')
    expect(groups[0].entries.map((entry) => (entry.item ? entry.item.link : 'assistants'))).toEqual([
      'assistants',
      '/chat/tasks'
    ])
  })
})

describe('cloud sidebar menu helpers', () => {
  it('detects external links from either the flag or URL', () => {
    expect(isExternalCloudMenuItem(menu({ link: '/chat' }))).toBe(false)
    expect(isExternalCloudMenuItem(menu({ link: '/x', external: true }))).toBe(true)
    expect(isExternalCloudMenuItem(menu({ link: 'https://code.xpertai.cn/' }))).toBe(true)
  })

  it('suppresses route active state for inactive path prefixes', () => {
    const chat = menu({
      link: '/chat',
      data: {
        inactivePathPrefixes: ['/chat/chatbi', '/chatbi']
      }
    })

    expect(isCloudMenuRouteSuppressed('/chat/x/common/c', chat)).toBe(false)
    expect(isCloudMenuRouteSuppressed('/chatbi', chat)).toBe(true)
    expect(isCloudMenuRouteSuppressed('/chat/chatbi/abc', chat)).toBe(true)
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
