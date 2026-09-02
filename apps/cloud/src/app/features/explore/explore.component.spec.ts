import { normalizeExploreTab } from './explore-route-state'

describe('Explore route state', () => {
  it('defaults to the agent square when the marketplace is enabled', () => {
    expect(normalizeExploreTab(null, true)).toBe('agent-square')
    expect(normalizeExploreTab(undefined, true)).toBe('agent-square')
    expect(normalizeExploreTab('unknown', true)).toBe('agent-square')
  })

  it('keeps explicit tab deep links', () => {
    expect(normalizeExploreTab('agent-square', true)).toBe('agent-square')
    expect(normalizeExploreTab('agents', true)).toBe('agent-square')
    expect(normalizeExploreTab('skills', true)).toBe('skills')
    expect(normalizeExploreTab('connectors', true)).toBe('connectors')
  })

  it('falls back to skills when the marketplace is disabled', () => {
    expect(normalizeExploreTab(null, false)).toBe('skills')
    expect(normalizeExploreTab('agent-square', false)).toBe('skills')
  })
})
