import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, Subject, of } from 'rxjs'
import { AssistantBindingScope, AssistantCode, type TXpertTeamDraft } from '@xpert-ai/contracts'

jest.mock('../../features/xpert/draft/editable-draft.util', () => ({
  buildEditableXpertDraft: (team) => ({ team, nodes: [], connections: [] })
}))
jest.mock('../../@shared/xpert/assistant-settings/xpert-settings-dialog.component', () => ({
  XpertSettingsDialogComponent: class {}
}))
jest.mock('./xpert.service', () => ({ XpertAPIService: class {} }))
jest.mock('./toastr.service', () => ({ ToastrService: class {} }))

import { Store } from '../state'
import { AssistantBindingService } from './assistant-binding.service'
import { XpertAPIService } from './xpert.service'
import { ToastrService } from './toastr.service'
import { XpertSettingsService } from './xpert-settings.service'
import type { XpertSettingsDialogData } from '../../@shared/xpert/assistant-settings/xpert-settings.types'

describe('shared settings server-backed source', () => {
  afterEach(() => TestBed.resetTestingModule())
  it('publishes the same Assistant, preserves its environment and rebases the cleared draft', async () => {
    let data: XpertSettingsDialogData
    let shown: () => void
    const displayed = new Promise<void>((resolve) => {
      shown = resolve
    })
    const closed = new Subject<void>()
    const store = { organizationId: 'org', selectOrganizationId: () => of('org') }
    const api = {
      getTeam: jest
        .fn()
        .mockReturnValueOnce(of({ id: 'fixture', title: 'Draft', environmentId: 'environment' }))
        .mockReturnValueOnce(of({ id: 'fixture', environmentId: 'environment' }))
        .mockReturnValue(of({ id: 'fixture', title: 'Published', draft: null, graph: { nodes: [], connections: [] } })),
      publish: jest.fn(() => of({ id: 'fixture', draft: null })),
      saveDraft: jest.fn((id, draft) => of(draft))
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: AssistantBindingService, useValue: { get: () => of(null), changes$: new Subject() } },
        { provide: XpertAPIService, useValue: api },
        { provide: TranslateService, useValue: { instant: (key) => key } },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        {
          provide: Dialog,
          useValue: {
            open: (component, config) => {
              data = config.data
              shown()
              return { closed }
            }
          }
        }
      ]
    })
    const opened = TestBed.inject(XpertSettingsService).open(undefined, 'fixture')
    await displayed
    await data.source.save()
    await data.publish()
    expect(api.publish).toHaveBeenCalledWith('fixture', false, {
      environmentId: 'environment',
      releaseNotes: 'XP.XpertSettings.PublishReleaseNotes'
    })
    expect(data.source.draft().team.title).toBe('Published')
    store.organizationId = 'changed'
    await expect(data.publish()).rejects.toThrow('XP.AssistantSettings.BindingChanged')
    expect(api.publish).toHaveBeenCalledTimes(1)
    closed.next()
    await opened
  })
  it('loads from an organization stream once, serializes writes, and keeps newer edits unsaved', async () => {
    let data: XpertSettingsDialogData
    let showDialog: () => void
    const displayed = new Promise<void>((resolve) => {
      showDialog = resolve
    })
    const closed = new Subject<TXpertTeamDraft>()
    const firstResponse = new Subject<TXpertTeamDraft>()
    const api = {
      getTeam: jest.fn(() => new BehaviorSubject({ id: 'fixture', title: 'Original' })),
      saveDraft: jest
        .fn()
        .mockImplementationOnce(() => firstResponse)
        .mockImplementation((id, draft) => of(draft))
    }
    const dialog = {
      open: jest.fn((component, config) => {
        data = config.data
        showDialog()
        return { closed }
      })
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: { organizationId: 'org', selectOrganizationId: () => of('org') } },
        { provide: AssistantBindingService, useValue: { get: () => of(null), changes$: new Subject() } },
        { provide: Dialog, useValue: dialog },
        { provide: XpertAPIService, useValue: api },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: ToastrService, useValue: { error: jest.fn() } }
      ]
    })
    const service = TestBed.inject(XpertSettingsService)
    const opened = service.open(undefined, 'fixture', 'models')
    await displayed
    expect(data.section).toBe('models')
    expect(api.getTeam).toHaveBeenCalledTimes(1)
    expect(api.saveDraft).not.toHaveBeenCalled()
    data.source.update((draft) => ({ ...draft, team: { ...draft.team, title: 'First' } }))
    const firstSave = data.source.save()
    await Promise.resolve()
    data.source.update((draft) => ({ ...draft, team: { ...draft.team, title: 'Second' } }))
    firstResponse.next({ team: { id: 'fixture', title: 'First' }, nodes: [], connections: [] })
    await firstSave
    expect(data.source.unsaved()).toBe(true)
    await data.source.save()
    expect(api.saveDraft.mock.calls.map(([, draft]) => draft.team.title)).toEqual(['First', 'Second'])
    expect(data.source.unsaved()).toBe(false)
    data.source.update((draft) => ({ ...draft, team: { ...draft.team, title: 'Discard me' } }))
    data.source.discard()
    expect(data.source.draft().team.title).toBe('Second')
    expect(data.source.unsaved()).toBe(false)
    expect(api.saveDraft).toHaveBeenCalledTimes(2)
    closed.next(data.source.draft())
    closed.complete()
    expect((await opened).team.title).toBe('Second')
  })
})

describe('binding-aware settings entry', () => {
  afterEach(() => TestBed.resetTestingModule())
  it.each([true, false])('shows personalization only for a matching binding (%s)', async (matches) => {
    const closed = new Subject<void>()
    let config: { data: XpertSettingsDialogData }
    let shown: () => void
    const displayed = new Promise<void>((resolve) => {
      shown = resolve
    })
    const binding = {
      id: 'binding',
      code: AssistantCode.CLAWXPERT,
      scope: AssistantBindingScope.USER,
      assistantId: matches ? 'fixture' : 'another',
      enabled: true
    }
    const organizations = new BehaviorSubject('org')
    const store = { organizationId: 'org', selectOrganizationId: () => organizations }
    const dialogRef = { closed, close: jest.fn(() => closed.next()) }
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: AssistantBindingService, useValue: { get: () => of(binding), changes$: new Subject() } },
        { provide: XpertAPIService, useValue: { getTeam: () => of({ id: 'fixture' }) } },
        { provide: TranslateService, useValue: { instant: (key) => key } },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        {
          provide: Dialog,
          useValue: {
            open: jest.fn((component, options) => {
              config = options
              shown()
              return dialogRef
            })
          }
        }
      ]
    })
    const opened = TestBed.inject(XpertSettingsService).open(undefined, 'fixture', 'personalization')
    await displayed
    expect(config.data.binding).toEqual(matches ? binding : null)
    expect(config.data.section).toBe(matches ? 'personalization' : 'general')
    store.organizationId = 'other-org'
    organizations.next('other-org')
    await opened
    expect(dialogRef.close).toHaveBeenCalled()
  })
})
