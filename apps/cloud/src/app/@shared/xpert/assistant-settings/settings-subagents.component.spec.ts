import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import type { TXpertTeamDraft } from '@xpert-ai/contracts'
import { SettingsSubagentsComponent } from './settings-subagents.component'
import { XpertSettingsEditor } from './xpert-settings.editor'

jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))

describe('sub-agent draft form', () => {
  function setup() {
    const draft = signal<TXpertTeamDraft>({
      team: { id: 'test', agent: { key: 'leader' } },
      nodes: [{ type: 'agent', key: 'leader', entity: { key: 'leader' }, position: { x: 0, y: 0 } }],
      connections: []
    })
    const save = jest.fn(async () => true)
    const source = {
      id: 'test',
      draft,
      saving: signal(false),
      update: (change: (value: TXpertTeamDraft) => TXpertTeamDraft) => draft.update(change)
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: XpertSettingsEditor, useValue: { source, save } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    })
    return { component: TestBed.runInInjectionContext(() => new SettingsSubagentsComponent()), draft, save }
  }
  afterEach(() => TestBed.resetTestingModule())
  it('keeps unapplied edits separate from the graph and resets without creating a node', () => {
    const { component, draft, save } = setup()
    component.edit()
    component.form.controls.title.setValue('Unsaved reviewer')
    expect(component.dirty()).toBe(true)
    expect(draft().nodes).toHaveLength(1)
    component.edit()
    expect(component.form.controls.title.value).toBe('Unsaved reviewer')
    component.reset()
    expect(component.dirty()).toBe(false)
    expect(draft().nodes).toHaveLength(1)
    expect(save).not.toHaveBeenCalled()
  })
  it('requires a valid title before applying the pending agent', async () => {
    const { component, draft, save } = setup()
    component.edit()
    component.form.controls.title.setValue('  ')
    expect(await component.save()).toBe(false)
    expect(component.form.controls.title.touched).toBe(true)
    expect(component.dirty()).toBe(true)
    expect(draft().nodes).toHaveLength(1)
    expect(save).not.toHaveBeenCalled()
  })
  it('retains applied graph data for a failed persistence retry without creating duplicates', async () => {
    const { component, draft, save } = setup()
    component.edit()
    component.form.controls.title.setValue('Reviewer')
    save.mockResolvedValueOnce(false)
    expect(await component.save()).toBe(false)
    expect(component.dirty()).toBe(false)
    expect(draft().nodes).toHaveLength(2)
    expect(draft().connections[0]).toMatchObject({ from: 'leader', to: component.selectedKey(), required: true })
    expect(await component.save()).toBe(true)
    expect(draft().nodes).toHaveLength(2)
    expect(save).toHaveBeenCalledTimes(2)
  })
})
