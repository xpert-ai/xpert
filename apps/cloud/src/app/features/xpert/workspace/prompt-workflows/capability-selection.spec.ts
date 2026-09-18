import {
  parsePromptCapabilityConfig,
  parsePromptCapabilitySelection,
  resolvePromptWorkflowCapabilities,
  type RuntimeCapabilitiesSelection
} from '@xpert-ai/contracts'
import {
  changePromptCapability,
  connectorCapabilityOptions,
  restoreExpertCapabilityDefaults,
  runtimeCapabilityOptions,
  selectedCapabilities
} from './capability-selection'

describe('Prompt workflow capability selection', () => {
  it('scopes graph node selections to each expert and preserves conversation defaults', () => {
    const first = changePromptCapability(null, 'expert-1', { kind: 'plugin', id: 'node-1' }, true, 'workspace-1')
    const second = changePromptCapability(first, 'expert-2', { kind: 'subAgent', id: 'node-2' }, true, 'workspace-1')
    expect(resolvePromptWorkflowCapabilities(second, 'expert-1')).toMatchObject({
      inheritUnselected: true,
      plugins: { nodeKeys: ['node-1'] }
    })
    expect(selectedCapabilities(resolvePromptWorkflowCapabilities(second, 'expert-2'))).toEqual([
      { kind: 'subAgent', id: 'node-2' }
    ])
    expect(resolvePromptWorkflowCapabilities(second, 'other')).toBeNull()
    const restored = restoreExpertCapabilityDefaults(second, 'expert-1')
    expect(resolvePromptWorkflowCapabilities(restored, 'expert-1')).toBeNull()
    expect(selectedCapabilities(resolvePromptWorkflowCapabilities(restored, 'expert-2'))).toHaveLength(1)
  })

  it('removes recommended selections as well as direct selections without changing other capabilities', () => {
    const legacy: RuntimeCapabilitiesSelection = {
      mode: 'allowlist',
      skills: { ids: ['skill-1'] },
      plugins: { nodeKeys: ['tool-1'] },
      recommended: { skills: { ids: ['skill-1'] }, plugins: { nodeKeys: [] } },
      connectors: { bindingIds: ['connector-1'] }
    }
    const next = changePromptCapability(legacy, '', { kind: 'skill', id: 'skill-1' }, false, 'workspace-1')
    expect(selectedCapabilities(next)).toEqual([
      { kind: 'plugin', id: 'tool-1' },
      { kind: 'connector', id: 'connector-1' }
    ])
    expect(parsePromptCapabilitySelection(next)?.inheritUnselected).toBeUndefined()
    expect(legacy.skills.ids).toEqual(['skill-1'])
    expect(legacy.recommended?.skills.ids).toEqual(['skill-1'])
  })

  it('preserves legacy settings for other experts when an expert overrides shared capabilities', () => {
    const legacy = {
      mode: 'allowlist',
      inheritUnselected: true,
      skills: { ids: ['skill-1'] },
      plugins: { nodeKeys: [] },
      customMetadata: { retained: true }
    }
    const next = changePromptCapability(legacy, 'expert-1', { kind: 'skill', id: 'skill-1' }, false, 'workspace-1')
    expect(resolvePromptWorkflowCapabilities(next, 'expert-1')).toBeNull()
    expect(resolvePromptWorkflowCapabilities(next, 'expert-2')).toEqual(legacy)
    const saved = JSON.parse(JSON.stringify(next))
    expect(parsePromptCapabilityConfig(saved)?.experts).toEqual([{ xpertId: 'expert-1', selection: null }])
    expect(resolvePromptWorkflowCapabilities(restoreExpertCapabilityDefaults(saved, 'expert-1'), 'expert-1')).toEqual(
      legacy
    )
  })

  it('keeps unsupported existing data intact and fails closed on malformed scoped data', () => {
    const unsupported = { mode: 'custom', payload: ['keep'] }
    expect(changePromptCapability(unsupported, 'expert-1', { kind: 'skill', id: 'skill-1' }, true, 'workspace-1')).toBe(
      unsupported
    )
    expect(parsePromptCapabilitySelection({ mode: 'allowlist', skills: { ids: [42] } })).toBeNull()
    const invalid = { type: 'expert_scoped_capabilities', version: 2, defaults: unsupported, experts: [] }
    expect(parsePromptCapabilityConfig(invalid)).toBeNull()
    expect(resolvePromptWorkflowCapabilities(invalid, 'expert-1')).toBeNull()
  })

  it('returns to defaults when the last additive capability is removed', () => {
    const selected = changePromptCapability(
      null,
      'expert-1',
      { kind: 'connector', id: 'binding-1' },
      true,
      'workspace-1'
    )
    expect(
      changePromptCapability(selected, 'expert-1', { kind: 'connector', id: 'binding-1' }, false, 'workspace-1')
    ).toBeNull()
  })

  it('marks explicitly selected skills as recommended so the runtime can include their instructions', () => {
    const value = changePromptCapability(null, 'expert-1', { kind: 'skill', id: 'skill-1' }, true, 'workspace-1')
    expect(resolvePromptWorkflowCapabilities(value, 'expert-1')).toMatchObject({
      inheritUnselected: true,
      recommended: { skills: { workspaceId: 'workspace-1', ids: ['skill-1'] } }
    })
  })

  it('uses typed endpoint groups and distinguishes missing authorization from inactive connections', () => {
    expect(
      runtimeCapabilityOptions({
        skills: [{ id: 's', label: 'A tool name' }, { id: 42 }],
        plugins: [{ nodeKey: 'p', label: 'Skill' }]
      })
    ).toEqual([
      { kind: 'skill', id: 's', label: 'A tool name', description: undefined },
      { kind: 'plugin', id: 'p', label: 'Skill', description: undefined }
    ])
    const options = connectorCapabilityOptions(
      {
        scope: { type: 'workspace', workspaceId: 'workspace-1' },
        items: [
          {
            bindingId: 'a',
            provider: 'a',
            label: 'Connected',
            status: 'active',
            granted: true,
            authorizationMode: 'personal'
          },
          {
            bindingId: 'b',
            provider: 'b',
            label: 'Consent',
            status: 'active',
            granted: false,
            authorizationMode: 'personal'
          },
          {
            bindingId: 'c',
            provider: 'c',
            label: 'Expired',
            status: 'expired',
            granted: true,
            authorizationMode: 'personal'
          }
        ]
      },
      'en'
    )
    expect(options.map((option) => option.unavailable)).toEqual([undefined, 'authorization', 'connection'])
  })
})
