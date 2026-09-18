import { Clipboard } from '@angular/cdk/clipboard'
import { ApplicationRef, getDebugNode, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl } from '@angular/forms'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { IPromptWorkflow, ITag } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import {
  PromptWorkflowAPIService,
  TagService,
  ToastrService,
  XpertAPIService,
  XpertConnectorService
} from '../../../../@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertWorkspacePromptWorkflowsComponent } from './workflows.component'
import { changePromptCapability } from './capability-selection'
import { PromptCapabilitySelectComponent } from './capability-select.component'
import { By } from '@angular/platform-browser'
import { PromptScenarioEditorComponent } from './scenario-editor.component'
import { PromptScenarioSettingsComponent } from './scenario-settings.component'

jest.mock('@milkdown/crepe', () => ({
  Crepe: class {
    static Feature = {}
  }
}))

const shared: IPromptWorkflow = {
  id: 'prompt-1',
  name: 'annual',
  label: 'Annual report',
  template: 'Report {{args}}',
  workspaceId: 'workspace-1',
  tags: ['legacy'],
  organizationTags: [{ id: 'tag-1', name: 'Reports' }],
  associatedXpertIds: []
}
const targeted: IPromptWorkflow = {
  id: 'prompt-2',
  name: 'slides',
  label: 'Slides',
  template: 'Create {{args}}',
  associatedXpertIds: ['expert-1']
}

describe('Workspace prompt editor', () => {
  it('edits, reorders, validates and saves scenario presets and restores them on reopen', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.edit(shared)
    fixture.detectChanges()
    const openEditor = () => {
      fixture.debugElement
        .query(By.directive(PromptScenarioSettingsComponent))
        .injector.get(PromptScenarioSettingsComponent)
        .open()
      TestBed.inject(ApplicationRef).tick()
      fixture.detectChanges()
      const element = document.querySelector('xp-prompt-scenario-editor')
      if (!element) throw new Error('Missing scenario drawer')
      return getDebugNode(element)!.injector.get(PromptScenarioEditorComponent)
    }
    const closeEditor = async () => {
      const done = document.querySelector<HTMLButtonElement>('[data-testid="z-ok-button"]')
      if (!done) throw new Error('Missing drawer done button')
      done.click()
      document.querySelector('[data-slot="sheet"]')?.dispatchEvent(new Event('animationend'))
      await fixture.whenStable()
      fixture.detectChanges()
    }
    expect(fixture.nativeElement.querySelector('xp-prompt-scenario-editor')).toBeNull()
    let editor = openEditor()
    const sheet = document.querySelector('[data-slot="sheet"]')
    expect(sheet?.classList.contains('right-0')).toBe(true)
    expect(sheet?.classList.contains('fixed')).toBe(true)
    expect(fixture.nativeElement.querySelector('xp-prompt-scenario-editor')).toBeNull()
    editor.add()
    await component.save()
    expect(api.updateInWorkspace).not.toHaveBeenCalled()
    component.form.controls.scenarios.at(0).patchValue({ label: 'Annual review', args: 'Make an annual PPT' })
    editor.add()
    component.form.controls.scenarios.at(1).patchValue({ label: 'AI trends', args: 'Make an AI trends PPT' })
    editor.move(1, -1)
    await closeEditor()
    expect(document.querySelector('xp-prompt-scenario-editor')).toBeNull()
    expect(fixture.nativeElement.querySelector('xp-prompt-scenario-settings').textContent).toContain(
      'AI trends · Annual review'
    )
    await component.save()
    const saved = component.form.getRawValue().scenarios
    expect(api.updateInWorkspace).toHaveBeenCalledWith(
      'workspace-1',
      shared.id,
      expect.objectContaining({ scenarios: saved })
    )
    expect(saved.map((scenario) => scenario.label)).toEqual(['AI trends', 'Annual review'])
    await component.edit({ ...shared, scenarios: saved })
    fixture.detectChanges()
    expect(component.form.getRawValue().scenarios).toEqual(saved)
    editor = openEditor()
    editor.remove(1)
    editor.remove(0)
    await closeEditor()
    await component.save()
    expect(api.updateInWorkspace).toHaveBeenLastCalledWith(
      'workspace-1',
      shared.id,
      expect.objectContaining({ scenarios: [] })
    )
  })
  const home = {
    workspace: signal({ id: 'workspace-1' }),
    canWriteWorkspace: signal(true),
    searchText: signal(''),
    tags: signal<ITag[]>([]),
    searchControl: new FormControl('')
  }
  const api = {
    getAllByWorkspace: jest.fn(),
    createInWorkspace: jest.fn(),
    updateInWorkspace: jest.fn(),
    archiveInWorkspace: jest.fn(),
    getUsage: jest.fn(),
    exportSkillCommand: jest.fn()
  }
  const xperts = { getAllByWorkspace: jest.fn(), getRuntimeCapabilities: jest.fn() }
  const clipboard = { copy: jest.fn(() => true) }
  beforeEach(async () => {
    jest.clearAllMocks()
    home.workspace.set({ id: 'workspace-1' })
    home.canWriteWorkspace.set(true)
    home.searchText.set('')
    home.tags.set([])
    api.getAllByWorkspace.mockReturnValue(of({ items: [shared, targeted] }))
    xperts.getAllByWorkspace.mockReturnValue(of({ items: [{ id: 'expert-1', name: 'Presentation expert' }] }))
    xperts.getRuntimeCapabilities.mockReturnValue(of({ skills: [], plugins: [], subAgents: [] }))
    api.createInWorkspace.mockImplementation((workspaceId, body) => of({ ...body, workspaceId, id: 'created' }))
    api.updateInWorkspace.mockImplementation((workspaceId, id, body) => of({ ...body, workspaceId, id }))
    api.exportSkillCommand.mockReturnValue({ name: 'annual' })
    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, TranslateModule.forRoot(), XpertWorkspacePromptWorkflowsComponent],
      providers: [
        { provide: XpertWorkspaceHomeComponent, useValue: home },
        { provide: PromptWorkflowAPIService, useValue: api },
        { provide: XpertAPIService, useValue: xperts },
        { provide: XpertConnectorService, useValue: { runtimeOptions: jest.fn(() => of({ items: [] })) } },
        { provide: Clipboard, useValue: clipboard },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: TagService, useValue: { getCatalogByCategory: jest.fn(() => of(shared.organizationTags)) } }
      ]
    }).compileComponents()
  })
  afterEach(() => TestBed.resetTestingModule())
  async function render() {
    const fixture = TestBed.createComponent(XpertWorkspacePromptWorkflowsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  it('renders a table, then an independent editor with organization tags and scope and no preview', async () => {
    const fixture = await render()
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(fixture.nativeElement.querySelector('form')).toBeNull()
    await fixture.componentInstance.edit(shared)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('tbody')).toBeNull()
    expect(fixture.nativeElement.querySelector('tag-select')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('xp-prompt-expert-select')).not.toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('使用预览')
    fixture.componentInstance.showAdvanced.set(true)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[formControlName="visibility"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('#prompt-args').getAttribute('aria-describedby')).toBe(
      'prompt-args-help'
    )
    expect(fixture.nativeElement.querySelector('#prompt-args-help').textContent).toContain(
      'XP.PromptWorkflow.ArgumentHintHelp'
    )
  })

  it('shows associated experts in a single-line scope cell with a full tooltip and removes the usage action', async () => {
    const experts = [
      { id: 'expert-1', name: 'Presentation expert' },
      { id: 'expert-2', name: 'Research expert' },
      { id: 'expert-3', name: 'Writing expert' }
    ]
    api.getAllByWorkspace.mockReturnValue(
      of({ items: [shared, { ...targeted, associatedXpertIds: experts.map((expert) => expert.id) }] })
    )
    xperts.getAllByWorkspace.mockReturnValue(of({ items: experts }))
    const fixture = await render()
    const cells = fixture.nativeElement.querySelectorAll('tbody tr:nth-child(2) td')
    const scope = cells[2].querySelector('[tabindex="0"]')
    expect(scope).not.toBeNull()
    expect(scope.classList.contains('truncate')).toBe(true)
    scope.dispatchEvent(new Event('mouseenter'))
    await fixture.whenStable()
    fixture.detectChanges()
    const tooltip = document.querySelector('[role="tooltip"]')
    for (const expert of experts) expect(tooltip?.textContent).toContain(expert.name)
    scope.dispatchEvent(new Event('mouseleave'))
    await fixture.whenStable()
    fixture.detectChanges()
    cells[4].querySelector('button').click()
    fixture.detectChanges()
    expect(document.querySelector('[role="menu"]')?.textContent).not.toContain('XP.PromptWorkflow.Usage')
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('XP.PromptWorkflow.CopySkillCommand')
    expect(api.getUsage).not.toHaveBeenCalled()
  })

  it('persists catalog IDs and explicit shared scope without converting legacy text tags', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.edit({ ...shared, visibility: 'private' })
    component.form.controls.argsHint.setValue('Enter the topic, audience, and page count.')
    component.form.controls.organizationTags.setValue([{ id: 'tag-2', name: 'PPT' }])
    component.setExperts(['expert-1'])
    component.setExperts([])
    expect(await component.save()).toBe(true)
    expect(api.updateInWorkspace).toHaveBeenCalledWith(
      'workspace-1',
      'prompt-1',
      expect.objectContaining({
        organizationTagIds: ['tag-2'],
        runtimeCapabilities: null,
        associatedXpertIds: [],
        tags: ['legacy'],
        visibility: 'private',
        argsHint: 'Enter the topic, audience, and page count.'
      })
    )
    expect(component.form.pristine).toBe(true)
  })

  it('creates blank prompts, blocks invalid forms and preserves drafts on server failure', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.edit()
    expect(component.form.controls.name.value).toBe('')
    expect(await component.save()).toBe(false)
    expect(api.createInWorkspace).not.toHaveBeenCalled()
    component.form.patchValue({ name: 'report', label: 'Report', template: 'Write {{args}}' })
    component.form.markAsDirty()
    api.createInWorkspace.mockReturnValue(throwError(() => new Error('Save failed')))
    expect(await component.save()).toBe(false)
    expect(component.form.controls.template.value).toBe('Write {{args}}')
    expect(component.form.dirty).toBe(true)
    expect(component.saveError()).toContain('Save failed')
  })

  it('filters by organization tag ID and associated expert and represents no matches', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    home.tags.set([{ id: 'different-tag', name: 'Reports' }])
    fixture.detectChanges()
    expect(component.filteredWorkflows()).toEqual([])
    expect(fixture.nativeElement.textContent).toContain('XP.PromptWorkflow.NoMatches')
    home.tags.set([])
    component.expertFilter.set('expert-1')
    expect(component.filteredWorkflows()).toEqual([shared, targeted])
  })

  it('preserves unavailable expert associations and blocks readonly saves', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.edit({ ...targeted, associatedXpertIds: ['deleted-expert'] })
    expect(component.form.controls.associatedXpertIds.value).toEqual(['deleted-expert'])
    home.canWriteWorkspace.set(false)
    fixture.detectChanges()
    expect(component.form.disabled).toBe(true)
    expect(await component.save()).toBe(false)
    expect(api.updateInWorkspace).not.toHaveBeenCalled()
  })

  it('ignores late list responses from a previous workspace', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    const pending = new Subject<{ items: IPromptWorkflow[] }>()
    api.getAllByWorkspace.mockReturnValueOnce(pending)
    const old = component.refresh()
    home.workspace.set({ id: 'workspace-2' })
    fixture.detectChanges()
    await fixture.whenStable()
    pending.next({ items: [{ ...shared, name: 'stale' }] })
    pending.complete()
    await old
    expect(component.workflows().some((item) => item.name === 'stale')).toBe(false)
  })

  it('keeps unsaved edits until the user chooses to discard or save them', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.edit(shared)
    component.form.controls.label.setValue('Unsaved')
    component.form.markAsDirty()
    const staying = component.back()
    fixture.detectChanges()
    expect(component.panel()).toBe('discard')
    component.closePanel(false)
    await staying
    expect(component.editing()).toBe(true)
    expect(component.form.controls.label.value).toBe('Unsaved')
    const leaving = component.back()
    fixture.detectChanges()
    component.closePanel(true)
    await leaving
    expect(component.editing()).toBe(false)
    expect(api.updateInWorkspace).not.toHaveBeenCalled()
  })

  it('copies using CDK Clipboard on the first click', async () => {
    const fixture = await render()
    fixture.componentInstance.copySkillCommand(shared)
    expect(clipboard.copy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(clipboard.copy.mock.calls[0][0])).toEqual({ name: 'annual' })
  })

  it('saves structured selections and restores them in the selector while retaining unsupported legacy data', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.edit(shared)
    const config = changePromptCapability(null, 'expert-1', { kind: 'skill', id: 'skill-1' }, true, 'workspace-1')
    component.setCapabilities(config)
    expect(component.form.dirty).toBe(true)
    expect(await component.save()).toBe(true)
    expect(api.updateInWorkspace).toHaveBeenLastCalledWith(
      'workspace-1',
      shared.id,
      expect.objectContaining({ runtimeCapabilities: config })
    )
    await component.edit({ ...shared, runtimeCapabilities: config })
    fixture.detectChanges()
    const picker = fixture.debugElement.query(By.directive(PromptCapabilitySelectComponent))
      .componentInstance as PromptCapabilitySelectComponent
    expect(picker.value()).toEqual(config)
    const old = { custom: 'existing configuration' }
    await component.edit({ ...shared, runtimeCapabilities: old })
    expect(await component.save()).toBe(true)
    expect(api.updateInWorkspace).toHaveBeenLastCalledWith(
      'workspace-1',
      shared.id,
      expect.objectContaining({ runtimeCapabilities: old })
    )
  })

  it('requires an explicit expert when copying a scoped capability configuration', async () => {
    const fixture = await render()
    const config = changePromptCapability(null, 'expert-1', { kind: 'plugin', id: 'node-1' }, true, 'workspace-1')
    const workflow = { ...shared, runtimeCapabilities: config }
    fixture.componentInstance.copySkillCommand(workflow)
    expect(fixture.componentInstance.panel()).toBe('export')
    expect(clipboard.copy).not.toHaveBeenCalled()
    fixture.componentInstance.copySkillCommand(workflow, 'expert-1')
    expect(api.exportSkillCommand).toHaveBeenCalledWith(workflow, 'expert-1')
    expect(clipboard.copy).toHaveBeenCalledTimes(1)
  })
})
