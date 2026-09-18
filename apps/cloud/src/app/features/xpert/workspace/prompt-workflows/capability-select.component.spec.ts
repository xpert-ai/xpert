import { TestBed } from '@angular/core/testing'
import { ApplicationRef } from '@angular/core'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { resolvePromptWorkflowCapabilities } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { XpertAPIService, XpertConnectorService } from '../../../../@core'
import { PromptCapabilitySelectComponent } from './capability-select.component'
import { changePromptCapability, selectedCapabilities } from './capability-selection'

jest.mock('@milkdown/crepe', () => ({
  Crepe: class {
    static Feature = {}
  }
}))

describe('Prompt capability picker', () => {
  const xperts = { getRuntimeCapabilities: jest.fn() }
  const connectors = { runtimeOptions: jest.fn() }
  const runtime = {
    skills: [{ id: 'skill-1', label: 'Presentation', description: 'Create slides' }],
    plugins: [{ nodeKey: 'tool-1', label: 'Web search' }],
    subAgents: [{ nodeKey: 'agent-1', label: 'Researcher' }]
  }
  beforeEach(async () => {
    jest.clearAllMocks()
    xperts.getRuntimeCapabilities.mockReturnValue(of(runtime))
    connectors.runtimeOptions.mockReturnValue(
      of({
        items: [
          { bindingId: 'binding-1', provider: 'docs', label: 'Documents', status: 'active', granted: true },
          { bindingId: 'binding-2', provider: 'mail', label: 'Mail', status: 'expired', granted: false }
        ]
      })
    )
    await TestBed.configureTestingModule({
      imports: [PromptCapabilitySelectComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: XpertAPIService, useValue: xperts },
        { provide: XpertConnectorService, useValue: connectors }
      ]
    }).compileComponents()
  })
  afterEach(() => TestBed.resetTestingModule())
  async function render(value: unknown = null) {
    const fixture = TestBed.createComponent(PromptCapabilitySelectComponent)
    fixture.componentRef.setInput('workspaceId', 'workspace-1')
    fixture.componentRef.setInput('experts', [
      { id: 'expert-1', name: 'Writer' },
      { id: 'expert-2', name: 'Researcher' }
    ])
    fixture.componentRef.setInput('value', value)
    fixture.componentInstance.valueChange.subscribe((next) => fixture.componentRef.setInput('value', next))
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  it('shows only skills, subexperts and connectors, searches and updates multiple selections', async () => {
    const fixture = await render()
    const picker = fixture.componentInstance
    picker.open()
    await fixture.whenStable()
    fixture.detectChanges()
    const categories = document.querySelector('[role="dialog"] [role="group"]')
    expect(categories?.querySelectorAll('button')).toHaveLength(3)
    expect(categories?.textContent).not.toContain('XP.PromptWorkflow.Capabilities.Kinds.plugin')
    expect(picker.activeCatalog()?.options).toHaveLength(5)
    picker.search.set('SLIDES')
    expect(picker.visibleOptions().map((option) => option.label)).toEqual(['Presentation'])
    picker.toggle(picker.visibleOptions()[0], true)
    fixture.detectChanges()
    picker.kind.set('connector')
    picker.search.set('')
    TestBed.inject(ApplicationRef).tick()
    const [allowed, denied] = picker.visibleOptions()
    picker.toggle(allowed, true)
    fixture.detectChanges()
    picker.toggle(denied, true)
    fixture.detectChanges()
    TestBed.inject(ApplicationRef).tick()
    expect(selectedCapabilities(resolvePromptWorkflowCapabilities(picker.value(), 'expert-1'))).toEqual([
      { kind: 'skill', id: 'skill-1' },
      { kind: 'connector', id: 'binding-1' }
    ])
    expect(fixture.nativeElement.textContent).toContain('Presentation')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'XP.PromptWorkflow.Capabilities.Reasons.authorization'
    )
    picker.close()
    picker.remove('expert-1', { kind: 'skill', id: 'skill-1' })
    fixture.detectChanges()
    expect(selectedCapabilities(resolvePromptWorkflowCapabilities(picker.value(), 'expert-1'))).toEqual([
      { kind: 'connector', id: 'binding-1' }
    ])
  })

  it('prevents new tool selections while retaining existing tools when editing other capabilities', async () => {
    const legacy = { mode: 'allowlist', skills: { ids: [] }, plugins: { nodeKeys: ['existing-tool'] } }
    const fixture = await render(legacy)
    const picker = fixture.componentInstance
    await picker.load('expert-1')
    picker.toggle({ kind: 'plugin', id: 'tool-1', label: 'Web search' }, true)
    fixture.detectChanges()
    expect(picker.value()).toEqual(legacy)
    picker.toggle({ kind: 'skill', id: 'skill-1', label: 'Presentation' }, true)
    fixture.detectChanges()
    expect(resolvePromptWorkflowCapabilities(picker.value(), 'expert-1')).toMatchObject({
      skills: { ids: ['skill-1'] },
      plugins: { nodeKeys: ['existing-tool'] }
    })
  })

  it('keeps unavailable selections visible and isolates failed catalogs from other categories', async () => {
    const selected = changePromptCapability(null, 'expert-1', { kind: 'skill', id: 'missing' }, true, 'workspace-1')
    xperts.getRuntimeCapabilities.mockReturnValueOnce(throwError(() => new Error('Forbidden')))
    const fixture = await render(selected)
    const picker = fixture.componentInstance
    expect(picker.reason('expert-1', { kind: 'skill', id: 'missing' })).toBe('LoadFailed')
    expect(picker.value()).toEqual(selected)
    picker.kind.set('connector')
    expect(picker.catalogError()).toBeUndefined()
    expect(picker.visibleOptions()).toHaveLength(2)
    await picker.load('expert-1', true)
    expect(picker.reason('expert-1', { kind: 'skill', id: 'missing' })).toBe('Missing')
    fixture.componentRef.setInput('associatedXpertIds', ['expert-2'])
    fixture.detectChanges()
    expect(picker.reason('expert-1', { kind: 'skill', id: 'missing' })).toBe('ExpertUnavailable')
    expect(picker.value()).toEqual(selected)
  })

  it('discards stale catalog responses when the workspace changes and blocks readonly edits', async () => {
    const fixture = await render()
    const picker = fixture.componentInstance
    const pending = new Subject<typeof runtime>()
    xperts.getRuntimeCapabilities.mockReturnValueOnce(pending)
    const request = picker.load('expert-1')
    fixture.componentRef.setInput('workspaceId', 'workspace-2')
    fixture.componentRef.setInput('experts', [])
    fixture.detectChanges()
    pending.next(runtime)
    await request
    expect(picker.catalogs().size).toBe(0)
    fixture.componentRef.setInput('disabled', true)
    fixture.detectChanges()
    const emit = jest.spyOn(picker.valueChange, 'emit')
    picker.reset()
    picker.remove('', { kind: 'skill', id: 'old' })
    picker.open()
    expect(emit).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
