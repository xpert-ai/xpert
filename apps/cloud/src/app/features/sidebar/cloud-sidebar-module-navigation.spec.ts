import { modulePanelLinks } from './cloud-sidebar-module-navigation'

const limited = { resourceAdmin: false, monitoring: false, usage: false }
describe('module panel navigation', () => {
  it('keeps privileged plugin resources separate from general plugin access', () => {
    expect(modulePanelLinks('plugins', limited).map((item) => item.id)).toEqual(['plugins', 'marketplace'])
    expect(modulePanelLinks('plugins', { ...limited, resourceAdmin: true }).map((item) => item.id)).toEqual([
      'plugins',
      'marketplace',
      'agent-plugins'
    ])
  })
  it('requires both monitoring availability and usage permission for usage navigation', () => {
    expect(modulePanelLinks('models', limited).map((item) => item.id)).toEqual(['basic'])
    expect(modulePanelLinks('models', { ...limited, usage: true }).map((item) => item.id)).toEqual(['basic'])
    expect(modulePanelLinks('models', { ...limited, monitoring: true }).map((item) => item.id)).toEqual([
      'basic',
      'overview'
    ])
    expect(modulePanelLinks('models', { ...limited, monitoring: true, usage: true }).map((item) => item.id)).toEqual([
      'basic',
      'overview',
      'usage'
    ])
  })
  it('retains all existing evolution sections and distinct durable MCP destinations', () => {
    expect(modulePanelLinks('evolution', limited).map((item) => item.id)).toEqual([
      'overview',
      'targets',
      'learning',
      'evaluation',
      'release'
    ])
    expect(modulePanelLinks('mcp', limited).map((item) => item.queryParams?.section)).toEqual(['services', 'runtimes'])
  })
  it('does not turn assistant approval into a different authorization domain', () => {
    expect(modulePanelLinks('approvals', limited).map((item) => item.path)).toEqual(['/xpert-access-requests'])
    expect(modulePanelLinks(undefined, limited)).toEqual([])
  })
})
