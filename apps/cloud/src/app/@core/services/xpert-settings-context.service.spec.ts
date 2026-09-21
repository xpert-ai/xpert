import { DIALOG_DATA } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, of } from 'rxjs'
import { AssistantBindingScope, AssistantCode, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { Store } from '../state'
import { AssistantBindingService } from './assistant-binding.service'
import { XpertSettingsContextService } from './xpert-settings-context.service'
import type { XpertSettingsSource } from '../../@shared/xpert/assistant-settings/xpert-settings.types'

function setup() {
  const binding = {
    id: 'binding',
    code: AssistantCode.CLAWXPERT,
    scope: AssistantBindingScope.USER,
    assistantId: 'assistant'
  }
  const organizations = new BehaviorSubject('organization')
  const draft = signal<TXpertTeamDraft>({
    team: { id: 'assistant', title: 'Edited title', agent: { key: 'leader' }, options: { scale: 0.8 } },
    nodes: [
      { type: 'agent', key: 'leader', position: { x: 1, y: 2 }, entity: { key: 'leader', prompt: 'Preserve me' } }
    ],
    connections: []
  })
  const source: XpertSettingsSource = {
    id: 'assistant',
    draft,
    workspaceDataScope: 'user',
    saving: signal(false),
    unsaved: signal(false),
    error: signal(null),
    update: (change) => draft.update(change),
    save: jest.fn(async () => undefined),
    reload: jest.fn(async () => undefined)
  }
  const bindings = {
    get: jest.fn(() => of(binding)),
    upsertPreference: jest.fn((code, value) => of({ assistantBindingId: binding.id, ...value }))
  }
  TestBed.configureTestingModule({
    providers: [
      XpertSettingsContextService,
      { provide: DIALOG_DATA, useValue: { source, binding, organizationId: 'organization' } },
      { provide: Store, useValue: { organizationId: 'organization', selectOrganizationId: () => organizations } },
      { provide: AssistantBindingService, useValue: bindings }
    ]
  })
  return { context: TestBed.inject(XpertSettingsContextService), source, bindings, binding, organizations }
}

describe('shared settings context boundaries', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('saves only personal documents to the matching user binding, without touching the Assistant draft', async () => {
    const { context, source, bindings } = setup()
    const before = source.draft()
    await context.saveUserPreference({ soul: 'Behavior', profile: 'Profile' })
    expect(bindings.upsertPreference).toHaveBeenCalledWith(AssistantCode.CLAWXPERT, {
      scope: AssistantBindingScope.USER,
      soul: 'Behavior',
      profile: 'Profile'
    })
    expect(source.draft()).toBe(before)
    expect(source.save).not.toHaveBeenCalled()
  })

  it('refuses personal saves after binding or organization changes', async () => {
    const { context, bindings, binding, organizations } = setup()
    bindings.get.mockReturnValue(of({ ...binding, assistantId: 'other' }))
    expect(await context.saveUserPreference({ soul: 'Do not write', profile: '' })).toBeNull()
    organizations.next('other-organization')
    expect(await context.saveUserPreference({ soul: 'Do not write', profile: '' })).toBeNull()
    expect(bindings.upsertPreference).not.toHaveBeenCalled()
  })

  it('merges trigger nodes into the same current draft and preserves unrelated form and graph edits', async () => {
    const { context, source } = setup()
    const before = source.draft()
    await context.saveTriggerDraft([
      {
        nodeKey: 'timer',
        provider: { name: 'timer', label: { en_US: 'Timer' } },
        config: { enabled: true, expression: 'daily' }
      }
    ])
    expect(source.draft().team.title).toBe('Edited title')
    expect(source.draft().team.options).toEqual(before.team.options)
    expect(source.draft().nodes[0]).toEqual(before.nodes[0])
    expect(source.draft().nodes.some((node) => node.key === 'timer')).toBe(true)
    expect(source.save).toHaveBeenCalledTimes(1)
    expect(context.triggerEditorItems()[0].nodeKey).toBe('timer')
  })
})
