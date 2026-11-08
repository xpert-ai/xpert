import type { EvolutionBaselineInspection } from '@xpert-ai/contracts'
import { compareRules, describeRule, inspectionFailure } from './rule-comparison'

const pointer = {
  pointerId: 'p',
  targetId: 'rules',
  scope: { type: 'organization', key: 'org' } as const,
  channel: 'production' as const,
  activeVersionId: 'v1',
  revision: 1,
  updatedAt: 'now',
  updatedBy: 'admin'
}
const version = {
  versionId: 'v1',
  targetId: 'rules',
  sequence: 1,
  semanticVersion: '1.0',
  artifact: { uri: 'test://a', schemaVersion: '1', mediaType: 'application/json' as const, hash: 'h' },
  providerKey: 'example',
  providerVersion: '1',
  dependencyVersionIds: [],
  createdAt: 'now',
  createdBy: 'a'
}
function inspection(content: string | null, preview: string, ready = true): EvolutionBaselineInspection {
  return {
    targetId: 'rules',
    status: ready ? 'update_available' : 'blocked',
    canManage: false,
    current: { pointer, version, contentJson: content },
    preview: { ready, hash: 's', issues: [], contentJson: preview }
  }
}

describe('rule baseline presentation', () => {
  it('does not turn diagnostics into comparable rules, including when a release owns the pointer', () => {
    const data = inspection('{"bindings":[{},{}],"limit":0,"enabled":false}', '{"code":"not_ready"}', false)
    data.status = 'managed_release'
    const view = compareRules(data)
    expect(view.rows.map((r) => r.key)).toEqual(['bindings', 'limit', 'enabled'])
    expect(view.rows.map((r) => r.source)).toEqual([undefined, undefined, undefined])
    expect(view.rows.map((r) => r.active)).toEqual([[{}, {}], 0, false])
    expect(view.source).toContain('not_ready')
  })
  it('preserves the union of rule fields and leaves opaque documents available as raw text', () => {
    const data = inspection('{"kind":"plug","legacy":true}', '{"schemaVersion":"2","newRule":null}')
    expect(compareRules(data).rows).toEqual([
      { key: 'legacy', active: true, source: undefined },
      { key: 'newRule', active: undefined, source: null }
    ])
    expect(compareRules(inspection(null, 'opaque text')).source).toBe('opaque text')
    expect(describeRule(null, 'key', (k) => k)).toBe('null')
    expect(describeRule(undefined, 'key', (k) => k)).toBe('NotRecorded')
  })
  it('requires the unsupported code and distinguishes a denied or failed request', () => {
    expect(inspectionFailure({ status: 400, error: { code: 'evolution_baseline_unsupported' } })).toBe('unsupported')
    expect(inspectionFailure({ status: 403, error: { code: 'evolution_baseline_unsupported' } })).toBe('denied')
    expect(inspectionFailure({ status: 400, error: { code: 'other' } })).toBe('failed')
  })
})
