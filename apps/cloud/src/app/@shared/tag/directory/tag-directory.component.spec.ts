import { KnowledgeTagsService } from '../../../@core/services/knowledge-tags.service'
import { By } from '@angular/platform-browser'
import { TenantTagMaintainComponent } from '../../../features/setting/tenant/maintain/maintain.component'
import { TestBed } from '@angular/core/testing'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { ITagDirectoryItem, PermissionsEnum, TagCategoryEnum } from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { ActiveScope, RequestScopeLevel, Store, TagService, ToastrService, XpertAPIService } from '../../../@core'
import { TagDirectoryComponent } from './tag-directory.component'

jest.mock('@milkdown/crepe', () => ({
  Crepe: class {
    static Feature = {}
  }
}))

const tags: ITagDirectoryItem[] = [
  {
    id: 'finance',
    name: 'Finance',
    label: { en_US: 'Finance', zh_Hans: '财务' },
    description: 'Budgets',
    category: TagCategoryEnum.XPERT,
    organizationId: 'org-1',
    editable: true,
    usage: [{ target: TagCategoryEnum.XPERT, count: 2 }]
  },
  { id: 'api', name: 'API', targets: [TagCategoryEnum.XPERT, TagCategoryEnum.TOOLSET], editable: false, usage: [] },
  {
    id: 'old',
    name: 'Old',
    targets: ['knowledgebase'],
    organizationId: 'org-1',
    isActive: false,
    editable: true,
    usage: []
  }
]

describe('TagDirectoryComponent', () => {
  const scope = new BehaviorSubject<ActiveScope>({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' })
  const permissions = new BehaviorSubject([{ permission: PermissionsEnum.ORG_TAGS_EDIT, enabled: true }])
  let service: { getDirectory: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; refresh: jest.Mock }
  const toastr = { success: jest.fn() }
  const knowledgeTags = { usage: jest.fn() }
  const xpertService = { getTagUsage: jest.fn() }
  beforeEach(async () => {
    TestBed.resetTestingModule()
    knowledgeTags.usage.mockReset().mockReturnValue(of({ items: [], total: 0 }))
    toastr.success.mockClear()
    xpertService.getTagUsage.mockReset().mockReturnValue(of({ items: [], total: 0 }))
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' })
    permissions.next([{ permission: PermissionsEnum.ORG_TAGS_EDIT, enabled: true }])
    service = {
      getDirectory: jest.fn(() => of(structuredClone(tags))),
      create: jest.fn(() => of(tags[0])),
      update: jest.fn(() => of({})),
      delete: jest.fn(() => of({})),
      refresh: jest.fn()
    }
    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, TranslateModule.forRoot(), TagDirectoryComponent, TenantTagMaintainComponent],
      providers: [
        { provide: KnowledgeTagsService, useValue: knowledgeTags },
        { provide: TagService, useValue: service },
        { provide: ToastrService, useValue: toastr },
        { provide: XpertAPIService, useValue: xpertService },
        {
          provide: Store,
          useValue: {
            selectActiveScope: () => scope,
            userRolePermissions$: permissions,
            userRolePermissions: permissions.value
          }
        }
      ]
    }).compileComponents()
  })
  afterEach(() => TestBed.resetTestingModule())
  async function render() {
    const fixture = TestBed.createComponent(TagDirectoryComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  it('shows knowledgebase names, candidate links and document counts with independent pagination', async () => {
    knowledgeTags.usage.mockReturnValueOnce(
      of({ items: [{ id: 'kb1', name: 'Financial Knowledge', candidate: true, documentCount: 4 }], total: 2 })
    )
    const fixture = await render()
    fixture.componentInstance.open('usage', { ...tags[0], usage: [{ target: 'knowledgebase', count: 6 }] })
    await fixture.whenStable()
    fixture.detectChanges()
    expect(document.body.textContent).toContain('Financial Knowledge')
    expect(knowledgeTags.usage).toHaveBeenCalledWith('finance', 0)
    knowledgeTags.usage.mockReturnValueOnce(
      of({ items: [{ id: 'kb2', name: 'Contracts', candidate: false, documentCount: 1 }], total: 2 })
    )
    await fixture.componentInstance.loadKnowledgeUsage(true)
    expect(knowledgeTags.usage).toHaveBeenLastCalledWith('finance', 1)
    expect(fixture.componentInstance.knowledgeUsage()).toHaveLength(2)
    fixture.componentInstance.close()
  })

  it('preserves summary on knowledge lookup failure and discards stale responses after switching tags', async () => {
    const fixture = await render()
    knowledgeTags.usage.mockReturnValueOnce(throwError(() => new Error('offline')))
    fixture.componentInstance.open('usage', { ...tags[0], usage: [{ target: 'knowledgebase', count: 6 }] })
    await fixture.whenStable()
    expect(fixture.componentInstance.knowledgeUsageError()).toContain('offline')
    const pending = new Subject<{ items: []; total: number }>()
    knowledgeTags.usage.mockReturnValueOnce(pending)
    const request = fixture.componentInstance.loadKnowledgeUsage()
    fixture.componentInstance.open('usage', tags[1])
    pending.next({ items: [], total: 99 })
    pending.complete()
    await request
    expect(fixture.componentInstance.knowledgeUsageTotal()).toBe(0)
    fixture.componentInstance.close()
  })

  it('lists the actual expert name and each associated version when viewing tag usage', async () => {
    xpertService.getTagUsage.mockReturnValue(
      of({
        items: [
          { id: 'v2', name: 'Finance Assistant', version: 'v2', latest: true, deleted: false },
          { id: 'v1', name: 'Finance Assistant', version: 'v1', latest: false, deleted: true }
        ],
        total: 2
      })
    )
    const fixture = await render()
    expect(xpertService.getTagUsage).not.toHaveBeenCalled()
    fixture.componentInstance.open('usage', tags[0])
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const panel = document.querySelector('cdk-dialog-container')
    expect(panel.textContent).toContain('Finance Assistant')
    expect(panel.textContent).toContain('v2')
    expect(panel.textContent).toContain('v1')
    expect(panel.textContent).toContain('XP.TagDirectory.DeletedExpert')
    expect(xpertService.getTagUsage).toHaveBeenCalledWith('finance', 0)
  })

  it('loads additional expert versions without replacing the existing names', async () => {
    const first = { id: 'v2', name: 'Finance Assistant', version: 'v2', latest: true, deleted: false }
    const next = { ...first, id: 'v1', version: 'v1', latest: false }
    xpertService.getTagUsage.mockReturnValueOnce(of({ items: [first], total: 2 }))
    const fixture = await render()
    fixture.componentInstance.open('usage', tags[0])
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    xpertService.getTagUsage.mockReturnValueOnce(of({ items: [next], total: 2 }))
    await fixture.componentInstance.loadXpertUsage(true)
    fixture.detectChanges()
    expect(xpertService.getTagUsage).toHaveBeenLastCalledWith('finance', 1)
    expect(document.querySelectorAll('cdk-dialog-container [data-xpert-id]')).toHaveLength(2)
    expect(document.querySelector('cdk-dialog-container').textContent).not.toContain('XP.TagDirectory.MoreExperts')
  })

  it('keeps the usage summary on a name lookup failure and allows retry', async () => {
    xpertService.getTagUsage.mockReturnValueOnce(throwError(() => new Error('Lookup failed')))
    const fixture = await render()
    fixture.componentInstance.open('usage', tags[0])
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(document.querySelector('cdk-dialog-container [role="alert"]').textContent).toContain('Lookup failed')
    expect(document.querySelector('cdk-dialog-container').textContent).toContain('XP.TagDirectory.UsageCount')
    xpertService.getTagUsage.mockReturnValueOnce(of({ items: [], total: 0 }))
    await fixture.componentInstance.loadXpertUsage()
    fixture.detectChanges()
    expect(document.querySelector('cdk-dialog-container [role="alert"]')).toBeNull()
    expect(document.querySelector('cdk-dialog-container').textContent).toContain('XP.TagDirectory.NoVisibleExperts')
  })

  it('ignores a previous tag lookup after opening another tag', async () => {
    const pending = new Subject<{
      items: { id: string; name: string; version: string; latest: boolean; deleted: boolean }[]
      total: number
    }>()
    xpertService.getTagUsage.mockReturnValueOnce(pending)
    const fixture = await render()
    fixture.componentInstance.open('usage', tags[0])
    fixture.detectChanges()
    expect(fixture.componentInstance.xpertUsageLoading()).toBe(true)
    fixture.componentInstance.open('usage', tags[1])
    pending.next({
      items: [{ id: 'private', name: 'Old expert', version: 'v1', latest: true, deleted: false }],
      total: 1
    })
    pending.complete()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.xpertUsage()).toEqual([])
    expect(document.querySelector('cdk-dialog-container').textContent).not.toContain('Old expert')
  })

  it('clears pending names when the dialog closes or the scope changes', async () => {
    const pending = new Subject<{ items: never[]; total: number }>()
    xpertService.getTagUsage.mockReturnValue(pending)
    const fixture = await render()
    fixture.componentInstance.open('usage', tags[0])
    fixture.detectChanges()
    fixture.componentInstance.close()
    fixture.detectChanges()
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-2' })
    fixture.detectChanges()
    pending.next({ items: [], total: 99 })
    pending.complete()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.xpertUsageTotal()).toBe(0)
    expect(fixture.componentInstance.xpertUsageLoading()).toBe(false)
    expect(document.querySelector('cdk-dialog-container')).toBeNull()
  })

  it('mounts the shared directory at the actual tenant tags entry', async () => {
    scope.next({ level: RequestScopeLevel.TENANT })
    service.getDirectory.mockReturnValue(of([{ ...tags[1], editable: true }]))
    const fixture = TestBed.createComponent(TenantTagMaintainComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const directory = fixture.debugElement.query(By.directive(TagDirectoryComponent))
    expect(directory).not.toBeNull()
    expect(fixture.nativeElement.querySelector('tag-maintain')).toBeNull()
    const component: TagDirectoryComponent = directory.componentInstance
    expect(component.canCreate()).toBe(true)
    expect(component.isTenantScope()).toBe(true)
    expect(fixture.nativeElement.textContent).toContain('XP.TagDirectory.TenantScope')
  })

  it('keeps tenant members without tag editing permission read-only', async () => {
    scope.next({ level: RequestScopeLevel.TENANT })
    permissions.next([{ permission: PermissionsEnum.ORG_TAGS_EDIT, enabled: false }])
    service.getDirectory.mockReturnValue(of([{ ...tags[1], editable: false }]))
    const { componentInstance: component } = await render()
    expect(component.canCreate()).toBe(false)
    component.open('edit')
    await component.save()
    expect(service.create).not.toHaveBeenCalled()
  })

  it('allows tenant tag managers to edit and re-enable shared tags', async () => {
    scope.next({ level: RequestScopeLevel.TENANT })
    const shared = { ...tags[1], editable: true, isActive: false }
    service.getDirectory.mockReturnValue(of([shared]))
    const fixture = await render(),
      component = fixture.componentInstance
    expect(component.canCreate()).toBe(true)
    expect(component.editable(shared)).toBe(true)
    component.open('enable', shared)
    await component.confirm()
    expect(service.update).toHaveBeenCalledWith('api', { isActive: true })
  })

  it('checks duplicate names against tenant tags in tenant scope', async () => {
    scope.next({ level: RequestScopeLevel.TENANT })
    service.getDirectory.mockReturnValue(of([{ ...tags[1], editable: true }]))
    const { componentInstance: component } = await render()
    component.open('edit')
    component.form.patchValue({ name: 'api', targets: [TagCategoryEnum.XPERT] })
    await component.save()
    expect(component.panelError()).toBeTruthy()
    expect(service.create).not.toHaveBeenCalled()
  })

  it('renders real rows, shared-readonly state and status counts', async () => {
    const fixture = await render()
    expect(fixture.nativeElement.querySelectorAll('tbody tr[data-tag-id]')).toHaveLength(3)
    expect(fixture.componentInstance.count('active')).toBe(2)
    expect(fixture.componentInstance.count('disabled')).toBe(1)
    expect(fixture.componentInstance.total(tags[0])).toBe(2)
    expect(fixture.componentInstance.editable(tags[1])).toBe(false)
  })

  it('combines search, source, status and multi-target filters', async () => {
    const { componentInstance: component } = await render()
    component.targetFilter.set('xpert')
    expect(component.visible().map((tag) => tag.id)).toEqual(['api', 'finance'])
    component.search.set('budgets')
    expect(component.visible().map((tag) => tag.id)).toEqual(['finance'])
    component.sourceFilter.set('tenant')
    expect(component.visible()).toEqual([])
    component.search.set('')
    component.sourceFilter.set('all')
    component.targetFilter.set('all')
    component.status.set('disabled')
    expect(component.visible().map((tag) => tag.id)).toEqual(['old'])
  })

  it('reacts to loss of editing permission and prevents writes', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    permissions.next([{ permission: PermissionsEnum.ORG_TAGS_EDIT, enabled: false }])
    fixture.detectChanges()
    expect(component.canCreate()).toBe(false)
    component.open('edit', tags[0])
    await component.save()
    expect(service.update).not.toHaveBeenCalled()
    expect(component.editable(tags[0])).toBe(false)
  })

  it('validates a new tag and sends one definition with multiple targets', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    component.open('edit')
    fixture.detectChanges()
    await component.save()
    expect(service.create).not.toHaveBeenCalled()
    component.form.patchValue({ name: 'New tag', description: 'A description' })
    component.setTarget(TagCategoryEnum.XPERT, true)
    component.setTarget('knowledgebase', true)
    await component.save()
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New tag',
        description: 'A description',
        targets: ['xpert', 'knowledgebase']
      })
    )
    expect(service.refresh).toHaveBeenCalled()
    expect(toastr.success).toHaveBeenCalledWith('XP.TagDirectory.Saved')
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).not.toContain('XP.TagDirectory.Saved')
  })

  it('omits color and icon controls and leaves existing metadata untouched on save', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    component.open('edit', { ...tags[0], color: 'red', icon: 'legacy-icon' })
    fixture.detectChanges()
    expect(document.querySelector('[formControlName="color"]')).toBeNull()
    expect(document.querySelector('[formControlName="icon"]')).toBeNull()
    await component.save()
    const payload = service.update.mock.calls[0][1]
    expect(payload).not.toHaveProperty('color')
    expect(payload).not.toHaveProperty('icon')
  })

  it('explains shared, system and permission read-only states through the lock and usage panel', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    expect(component.readOnlyReason(tags[1])).toBe('XP.TagDirectory.SharedReadOnly')
    expect(component.readOnlyReason({ ...tags[0], isSystem: true })).toBe('XP.TagDirectory.SystemReadOnly')
    const lock: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[aria-label="XP.TagDirectory.SharedReadOnly"]'
    )
    lock.click()
    fixture.detectChanges()
    expect(document.querySelector('cdk-dialog-container').textContent).toContain('XP.TagDirectory.SharedReadOnly')
    expect(document.querySelector('cdk-dialog-container').textContent).toContain('XP.TagDirectory.UsageExplanation')
    permissions.next([{ permission: PermissionsEnum.ORG_TAGS_EDIT, enabled: false }])
    fixture.detectChanges()
    expect(component.readOnlyReason(tags[0])).toBe('XP.TagDirectory.PermissionReadOnly')
  })

  it('keeps duplicate and API errors with the fixed actions outside the scrolling form', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    component.open('edit')
    component.form.patchValue({ name: 'finance', targets: [TagCategoryEnum.XPERT] })
    await component.save()
    fixture.detectChanges()
    expect(document.querySelector('footer [role="alert"]').textContent).toContain('XP.TagDirectory.Duplicate')
    expect(document.querySelector('#tag-directory-form [role="alert"]')).toBeNull()
    component.form.controls.name.setValue('New name')
    service.create.mockReturnValue(throwError(() => new Error('Target is in use')))
    await component.save()
    fixture.detectChanges()
    expect(document.querySelector('footer [role="alert"]').textContent).toContain('Target is in use')
    expect(document.querySelector('footer button[form="tag-directory-form"]')).not.toBeNull()
  })

  it.each([RequestScopeLevel.ORGANIZATION, RequestScopeLevel.TENANT])(
    'offers only knowledge bases and digital experts in the filter and editor at %s scope',
    async (level) => {
      scope.next(level === RequestScopeLevel.TENANT ? { level } : { level, organizationId: 'org-1' })
      const fixture = await render()
      const filter = fixture.nativeElement.querySelector('z-select[aria-label="XP.TagDirectory.Targets"] button')
      filter.click()
      fixture.detectChanges()
      expect(
        Array.from(document.querySelectorAll('[role="listbox"] [role="option"]'), (item) => item.getAttribute('value'))
      ).toEqual(['all', 'knowledgebase', 'xpert'])
      filter.click()
      fixture.detectChanges()

      fixture.componentInstance.open('edit')
      fixture.detectChanges()
      const editor = document.querySelector('#tag-directory-form')
      expect(Array.from(editor.querySelectorAll('z-checkbox'), (item) => item.textContent.trim())).toEqual([
        'XP.TagDirectory.Target.knowledgebase',
        'XP.TagDirectory.Target.xpert'
      ])
      expect(editor.textContent).not.toContain('XP.TagDirectory.LegacyTargetsRetained')
    }
  )

  it.each([TagCategoryEnum.TOOLSET, TagCategoryEnum.INDICATOR, TagCategoryEnum.STORY])(
    'preserves a legacy %s category when editing without selecting a new target',
    async (category) => {
      const fixture = await render(),
        component = fixture.componentInstance
      component.open('edit', { ...tags[0], category })
      fixture.detectChanges()
      expect(document.querySelector('#tag-directory-form').textContent).toContain(
        'XP.TagDirectory.LegacyTargetsRetained'
      )
      component.form.controls.description.setValue('Revised legacy tag')
      await component.save()
      expect(service.update).toHaveBeenCalledWith(
        'finance',
        expect.objectContaining({ description: 'Revised legacy tag', targets: [category] })
      )
    }
  )

  it('retains historical targets while changing the supported uses of an existing tag', async () => {
    const { componentInstance: component } = await render()
    component.open('edit', {
      ...tags[0],
      targets: [TagCategoryEnum.XPERT, TagCategoryEnum.TOOLSET, 'people', 'integration']
    })
    component.setTarget(TagCategoryEnum.XPERT, false)
    component.setTarget('knowledgebase', true)
    await component.save()
    expect(service.update).toHaveBeenCalledWith(
      'finance',
      expect.objectContaining({ targets: ['toolset', 'people', 'integration', 'knowledgebase'] })
    )
    expect(service.delete).not.toHaveBeenCalled()
  })

  it('prevents duplicate names before writing', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    component.open('edit')
    component.form.patchValue({ name: 'finance', targets: [TagCategoryEnum.XPERT] })
    await component.save()
    expect(service.create).not.toHaveBeenCalled()
    expect(component.panelError()).toBeTruthy()
  })

  it('preserves translated labels and edits description rather than a misspelled field', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    component.open('edit', tags[0])
    component.form.controls.description.setValue('Revised')
    await component.save()
    expect(service.update).toHaveBeenCalledWith(
      'finance',
      expect.objectContaining({ description: 'Revised', label: { en_US: 'Finance', zh_Hans: '财务' } })
    )
  })

  it('requires confirmation and updates only status when disabling', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    component.open('disable', tags[0])
    expect(service.update).not.toHaveBeenCalled()
    await component.confirm()
    expect(service.update).toHaveBeenCalledWith('finance', { isActive: false })
    expect(service.delete).not.toHaveBeenCalled()
  })

  it('does not delete used tags and supports unused deletion', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    component.open('delete', tags[0])
    await component.confirm()
    expect(service.delete).not.toHaveBeenCalled()
    component.open('delete', tags[2])
    await component.confirm()
    expect(service.delete).toHaveBeenCalledWith('old')
  })

  it('keeps edits and reports API failure without closing the editor', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    service.update.mockReturnValue(throwError(() => new Error('Save failed')))
    component.open('edit', tags[0])
    component.form.controls.description.setValue('Pending change')
    await component.save()
    expect(component.panelError()).toContain('Save failed')
    expect(component.form.controls.description.value).toBe('Pending change')
    expect(component.saving()).toBe(false)
  })

  it('ignores stale directory responses after another load', async () => {
    const fixture = await render(),
      component = fixture.componentInstance
    const old = new Subject<ITagDirectoryItem[]>()
    service.getDirectory.mockReturnValueOnce(old)
    const pending = component.load()
    service.getDirectory.mockReturnValueOnce(of([{ ...tags[0], id: 'current' }]))
    await component.load()
    old.next(tags)
    old.complete()
    await pending
    expect(component.tags()[0].id).toBe('current')
  })

  it('reloads the directory on organization changes', async () => {
    const fixture = await render()
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-2' })
    fixture.detectChanges()
    await fixture.whenStable()
    expect(service.getDirectory).toHaveBeenCalledTimes(2)
  })
})
