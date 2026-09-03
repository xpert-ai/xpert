export type ExploreTab = 'skills' | 'agent-square' | 'connectors'

export const DEFAULT_EXPLORE_TAB: ExploreTab = 'agent-square'

export function normalizeExploreTab(value: string | null | undefined, agentMarketplaceEnabled: boolean): ExploreTab {
  if (agentMarketplaceEnabled && (value === 'agent-square' || value === 'agents')) {
    return 'agent-square'
  }
  if (value === 'connectors') {
    return 'connectors'
  }
  if (value === 'skills') {
    return 'skills'
  }
  return agentMarketplaceEnabled ? DEFAULT_EXPLORE_TAB : 'skills'
}
