import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { SKILLS_MIDDLEWARE_NAME, TAgentMiddlewareDescriptor, TXpertTeamDraft } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { XpertAgentService, XpertAPIService } from '@cloud/app/@core'
import { SettingsMiddlewareComponent } from './settings-middleware.component'
import { saveMiddleware } from './settings-middleware.utils'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { JsonSchemaWidgetStrategyRegistry } from '../../forms/json-schema-property/json-schema-widget-registry.service'

jest.mock('@cloud/app/@shared/forms', () => ({ JSONSchemaFormComponent: class {} }))

const catalog: TAgentMiddlewareDescriptor[] = [
  { meta: { name: 'review', label: { en_US: 'Review' } }, source: { kind: 'builtin' } },
  { meta: { name: SKILLS_MIDDLEWARE_NAME, label: { en_US: 'Skills' } }, source: { kind: 'builtin' } },
  { meta: { name: 'internal', label: { en_US: 'Internal' }, builtin: true }, source: { kind: 'builtin' } }
]

describe('settings skills and middleware forms', () => {
  function setup(mode: 'skills' | 'middleware' = 'middleware') {
    const draft = signal<TXpertTeamDraft>({
      team: { id: 'test', workspaceId: 'workspace', agent: { key: 'primary' } },
      nodes: [
        { type: 'agent', key: 'primary', entity: { key: 'primary' }, position: { x: 0, y: 0 } },
        { type: 'agent', key: 'child', entity: { key: 'child' }, position: { x: 1, y: 1 } }
      ],
      connections: []
    })
    const save = jest.fn(async () => true)
    const api = {
      getAgentMiddlewareStrategies: jest.fn(() => of(catalog)),
      getAgentMiddleware: jest.fn(() => of({ tools: [] }))
    }
    TestBed.configureTestingModule({
      imports: [SettingsMiddlewareComponent],
      providers: [
        {
          provide: XpertSettingsEditor,
          useValue: {
            save,
            source: {
              id: 'test',
              draft,
              saving: signal(false),
              update: (change: (value: TXpertTeamDraft) => TXpertTeamDraft) => draft.update(change)
            }
          }
        },
        { provide: XpertAgentService, useValue: api },
        { provide: XpertAPIService, useValue: { getNodeVariables: jest.fn(() => of([])) } },
        {
          provide: TranslateService,
          useValue: { currentLang: 'en', onLangChange: new Subject(), instant: (key: string) => key }
        }
      ]
    }).overrideComponent(SettingsMiddlewareComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(SettingsMiddlewareComponent)
    fixture.componentRef.setInput('mode', mode)
    return {
      component: fixture.componentInstance,
      draft,
      save,
      api,
      registry: fixture.debugElement.injector.get(JsonSchemaWidgetStrategyRegistry)
    }
  }
  afterEach(() => TestBed.resetTestingModule())

  it('registers the same custom widgets as Studio, including the workspace skill picker', () => {
    const { registry } = setup('skills')
    for (const name of ['skills-select', 'ai-model-select', 'agent-interrupt-on', 'code-editor']) {
      expect(registry.has(name)).toBe(true)
      expect(registry.get(name).load).toBeDefined()
    }
  })

  it('defaults to the primary agent and separates skills from addable middleware providers', async () => {
    const { component } = setup()
    await component.load()
    expect(component.targetKey()).toBe('primary')
    expect(component.choices().map(({ meta }) => meta.name)).toEqual(['review'])
    expect(component.formContext().workspaceId).toBe('workspace')
  })
  it('keeps new forms unapplied, prevents losing edits on target changes and cancels without creating a node', async () => {
    const { component, draft } = setup()
    await component.load()
    component.edit()
    expect(component.dirty()).toBe(true)
    component.form.controls.options.setValue({ prompt: 'Review carefully' })
    component.selectTarget('child')
    expect(component.targetKey()).toBe('primary')
    expect(draft().nodes).toHaveLength(2)
    component.reset()
    expect(component.dirty()).toBe(false)
    component.selectTarget('child')
    expect(component.targetKey()).toBe('child')
    expect(draft().nodes).toHaveLength(2)
  })
  it('validates before applying and retries persistence without creating duplicate nodes', async () => {
    const { component, draft, save } = setup()
    await component.load()
    component.edit()
    component.form.controls.title.setValue('  ')
    expect(await component.save()).toBe(false)
    expect(save).not.toHaveBeenCalled()
    component.form.controls.title.setValue('Review')
    component.form.controls.options.setValue({ mode: 'strict' })
    save.mockResolvedValueOnce(false)
    expect(await component.save()).toBe(false)
    expect(draft().connections).toEqual([
      { type: 'workflow', key: `primary/${component.selectedKey()}`, from: 'primary', to: component.selectedKey() }
    ])
    expect(component.dirty()).toBe(false)
    expect(await component.save()).toBe(true)
    expect(draft().nodes).toHaveLength(3)
  })
  it('configures an existing skills assignment and prevents adding a duplicate', async () => {
    const { component, draft } = setup('skills')
    draft.update((value) =>
      saveMiddleware(value, 'primary', 'skills', {
        title: 'Skills',
        provider: SKILLS_MIDDLEWARE_NAME,
        options: { skills: ['old'], systemPrompt: 'Keep' },
        tools: { search: false }
      })
    )
    await component.load()
    expect(component.choices().map(({ meta }) => meta.name)).toEqual([SKILLS_MIDDLEWARE_NAME])
    expect(component.canAdd()).toBe(false)
    component.edit(component.assigned()[0])
    component.form.controls.options.setValue({ ...component.form.controls.options.value, skills: ['new'] })
    await component.save()
    expect(component.assigned()[0].entity).toMatchObject({
      options: { skills: ['new'], systemPrompt: 'Keep' },
      tools: { search: false }
    })
    component.pendingRemoval.set(component.assigned()[0])
    await component.remove()
    expect(component.assigned()).toEqual([])
    expect(component.canAdd()).toBe(true)
  })
  it('offers retry after a catalog failure without altering the draft', async () => {
    const { component, draft, api } = setup()
    api.getAgentMiddlewareStrategies.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    await component.load()
    expect(component.loadError()).toBeTruthy()
    expect(component.canAdd()).toBe(false)
    await component.load()
    expect(component.loadError()).toBeNull()
    expect(component.canAdd()).toBe(true)
    expect(draft().nodes).toHaveLength(2)
  })
})
