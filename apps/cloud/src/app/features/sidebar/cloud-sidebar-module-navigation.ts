import type { SidebarPanelLink } from './cloud-sidebar-panel-links.component'
import type { CloudMenuData } from './cloud-sidebar-menu.types'

export type SidebarModuleAccess = { resourceAdmin: boolean; monitoring: boolean; usage: boolean }

/** Explicit module keys and destinations; translated labels never determine navigation or access. */
export function modulePanelLinks(kind: CloudMenuData['panel'], access: SidebarModuleAccess): SidebarPanelLink[] {
  const item = (id: string, translationKey: string, label: string, path: string, icon: string): SidebarPanelLink => ({
    id,
    translationKey,
    label,
    path,
    icon
  })
  switch (kind) {
    case 'evolution':
      return [
        item('overview', 'XP.AgentEvolution.TabOverview', 'Overview', '/agent-evolution/overview', 'ri-dashboard-line'),
        item('targets', 'XP.AgentEvolution.TabTargets', 'Targets', '/agent-evolution/targets', 'ri-focus-3-line'),
        item(
          'learning',
          'XP.AgentEvolution.TabLearning',
          'Learning',
          '/agent-evolution/learning',
          'ri-lightbulb-flash-line'
        ),
        item(
          'evaluation',
          'XP.AgentEvolution.TabEvaluation',
          'Evaluation',
          '/agent-evolution/evaluation',
          'ri-flask-line'
        ),
        item('release', 'XP.AgentEvolution.TabRelease', 'Release', '/agent-evolution/release', 'ri-rocket-line')
      ]
    case 'plugins':
      return [
        {
          ...item('plugins', 'XP.Plugin.Installed', 'Installed', '/plugins', 'ri-plug-line'),
          queryParams: { category: 'plugins' },
          queryParamDefaults: { category: 'plugins' }
        },
        {
          ...item('marketplace', 'XP.Plugin.ExploreMarketplace', 'Marketplace', '/plugins', 'ri-store-line'),
          queryParams: { category: 'marketplace' }
        },
        ...(access.resourceAdmin
          ? [
              {
                ...item('agent-plugins', 'XP.AgentPlugins.PageTitle', 'Agent Plugins', '/plugins', 'ri-robot-line'),
                queryParams: { category: 'agent-plugins' }
              }
            ]
          : [])
      ]
    case 'mcp':
      return [
        {
          ...item('services', 'XP.Operations.McpServices', 'MCP services', '/operations', 'orbit'),
          queryParams: { section: 'services' },
          queryParamDefaults: { section: 'services' }
        },
        {
          ...item('runtimes', 'XP.Operations.RuntimeInstances', 'Runtime instances', '/operations', 'activity'),
          queryParams: { section: 'runtimes' }
        }
      ]
    case 'models':
      return [
        item('basic', 'XP.KEY_WORDS.Basic', 'Basic', '/copilot/basic', 'generating_tokens'),
        ...(access.monitoring
          ? [item('overview', 'XP.Copilot.Overview', 'Overview', '/copilot/overview', 'monitoring')]
          : []),
        ...(access.monitoring && access.usage
          ? [item('usage', 'XP.Copilot.UsageCenter', 'Usage center', '/copilot/usage', 'data_usage')]
          : [])
      ]
    case 'approvals':
      return [
        item(
          'requests',
          'XP.MENU.Xpert Access Requests',
          'Assistant access requests',
          '/xpert-access-requests',
          'approval'
        )
      ]
    default:
      return []
  }
}
