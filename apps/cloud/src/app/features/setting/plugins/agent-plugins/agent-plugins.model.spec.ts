import { BindingSummary, groupPluginPackages, PackageSummary } from './agent-plugins.model'

const pkg = (id: string, name: string, version = '1.0.0'): PackageSummary => ({
  id,
  digest: id.padEnd(64, '0'),
  descriptor: { name, version, skills: [], servers: [], diagnostics: [] }
})
const binding = (id: string, packageId: string, fields: Partial<BindingSummary> = {}): BindingSummary => ({
  id,
  title: 'Published name',
  version: 'opaque-binding-version',
  enabled: true,
  workspaceIds: ['workspace'],
  definition: { kind: 'agent_plugin', packageId, experts: {} },
  ...fields
})

describe('agent plugin catalog', () => {
  it('groups by manifest identity while preserving distinct imports with identical version labels', () => {
    const groups = groupPluginPackages([pkg('new', 'documents'), pkg('old', 'documents'), pkg('other', 'pdf')], [])
    expect(groups).toHaveLength(2)
    expect(groups[0].packages.map((item) => item.id)).toEqual(['new', 'old'])
  })
  it('shows the published package instead of silently upgrading to the latest import', () => {
    const [group] = groupPluginPackages(
      [pkg('new', 'documents', '2.0.0'), pkg('old', 'documents')],
      [binding('live', 'old')]
    )
    expect(group.displayPackage.id).toBe('old')
    expect(group.packages[0].id).toBe('new')
  })
  it('does not include middleware, experts, superseded or disabled scopes in active workspace counts', () => {
    const [group] = groupPluginPackages(
      [pkg('pkg', 'documents')],
      [
        binding('old', 'pkg', { supersededById: 'live', workspaceIds: ['old-workspace'] }),
        binding('off', 'pkg', { enabled: false, workspaceIds: ['disabled-workspace'] }),
        binding('live', 'pkg'),
        binding('another', 'pkg', { workspaceIds: ['workspace', 'second'] }),
        binding('middleware', 'pkg', { definition: { kind: 'middleware', provider: 'example', options: {} } }),
        binding('expert', 'pkg', { definition: { kind: 'external_xpert', xpertId: 'expert' } })
      ]
    )
    expect(group.bindings).toHaveLength(4)
    expect(group.currentBindings).toHaveLength(3)
    expect(group.workspaceIds).toEqual(['workspace', 'second'])
    expect(group.publishedVersions).toEqual(['pkg'])
  })
  it('retains multiple active bindings and versions instead of picking one to overwrite', () => {
    const [group] = groupPluginPackages(
      [pkg('new', 'documents', '2.0.0'), pkg('old', 'documents')],
      [binding('a', 'new'), binding('b', 'old')]
    )
    expect(group.currentBindings.map((item) => item.id)).toEqual(['a', 'b'])
    expect(group.publishedVersions).toEqual(['new', 'old'])
  })
  it('distinguishes never published from disabled, and excludes historical versions from current status', () => {
    expect(groupPluginPackages([pkg('pkg', 'documents')], [binding('off', 'pkg', { enabled: false })])[0].status).toBe(
      'disabled'
    )
    expect(groupPluginPackages([pkg('pkg', 'documents')], [])[0].status).toBe('unpublished')
    expect(
      groupPluginPackages([pkg('pkg', 'documents')], [binding('old', 'pkg', { supersededById: 'other' })])[0].status
    ).toBe('unpublished')
  })
})
