import { Dialog } from '@angular/cdk/dialog'
import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, Subject, of, throwError, type Observable } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantCode,
  type IAssistantBinding,
  type IXpert,
  type TXpertTeamDraft
} from '@xpert-ai/contracts'

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
import type {
  XpertSettingsDialogData,
  XpertSettingsSource
} from '../../@shared/xpert/assistant-settings/xpert-settings.types'

import type { XpertSettingsLoaderData } from '../../@shared/xpert/assistant-settings/xpert-settings-loader.component'

async function settleLoad() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loaded(loader: XpertSettingsLoaderData): Promise<XpertSettingsDialogData> {
  await settleLoad()
  const state = loader.state()
  if (state.status !== 'ready') throw new Error(`Expected ready settings, received ${state.status}`)
  return state.data
}

describe('shared settings server-backed source', () => {
  afterEach(() => TestBed.resetTestingModule())
  it('opens Studio settings on the live draft without providing a publication callback', async () => {
    let data: XpertSettingsDialogData
    let loader: XpertSettingsLoaderData
    let shown: () => void
    const displayed = new Promise<void>((resolve) => {
      shown = resolve
    })
    const closed = new Subject<void>()
    const api = { getTeam: jest.fn(), publish: jest.fn() }
    const source: XpertSettingsSource = {
      id: 'fixture',
      draft: signal({ team: { id: 'fixture' }, nodes: [], connections: [] }),
      workspaceDataScope: 'shared',
      unsaved: signal(false),
      saving: signal(false),
      error: signal(null),
      update: jest.fn(),
      save: jest.fn(async () => {})
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: { organizationId: 'org', selectOrganizationId: () => of('org') } },
        { provide: AssistantBindingService, useValue: { get: () => of(null), changes$: new Subject() } },
        { provide: XpertAPIService, useValue: api },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        {
          provide: Dialog,
          useValue: {
            open: (_component, config) => {
              loader = config.data
              shown()
              return { closed }
            }
          }
        }
      ]
    })
    const opened = TestBed.inject(XpertSettingsService).open(
      undefined,
      'fixture',
      undefined,
      source,
      undefined,
      'draft'
    )
    await displayed
    data = await loaded(loader)
    expect(data.source).toBe(source)
    expect(data.saveMode).toBe('draft')
    expect(data.publish).toBeUndefined()
    expect(api.getTeam).not.toHaveBeenCalled()
    await data.source.save()
    expect(source.save).toHaveBeenCalledTimes(1)
    expect(api.publish).not.toHaveBeenCalled()
    closed.next()
    await opened
  })
  it('publishes the same Assistant, preserves its environment and rebases the cleared draft', async () => {
    let data: XpertSettingsDialogData
    let loader: XpertSettingsLoaderData
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
              loader = config.data
              shown()
              return { closed }
            }
          }
        }
      ]
    })
    const opened = TestBed.inject(XpertSettingsService).open(undefined, 'fixture')
    await displayed
    data = await loaded(loader)
    expect(data.saveMode).toBe('publish')
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
    let loader: XpertSettingsLoaderData
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
        loader = config.data
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
    data = await loaded(loader)
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
    let config: { data: XpertSettingsLoaderData }
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
    const data = await loaded(config.data)
    expect(data.binding).toEqual(matches ? binding : null)
    expect(data.section).toBe(matches ? 'personalization' : 'general')
    store.organizationId = 'other-org'
    organizations.next('other-org')
    await opened
    expect(dialogRef.close).toHaveBeenCalled()
  })
})

describe('settings dialog loading lifecycle', () => {
  afterEach(() => TestBed.resetTestingModule())

  function setup() {
    const team = new Subject<IXpert>()
    const binding = new Subject<IAssistantBinding | null>()
    const organizations = new BehaviorSubject('org')
    const changes = new Subject<{ code: AssistantCode; scope: AssistantBindingScope }>()
    const store = { organizationId: 'org', selectOrganizationId: () => organizations }
    const api = { getTeam: jest.fn((): Observable<IXpert> => team) }
    const bindings = { get: jest.fn((): Observable<IAssistantBinding | null> => binding), changes$: changes }
    const closed = new Subject<void>()
    const ref = { closed, close: jest.fn(() => closed.next()) }
    let loader: XpertSettingsLoaderData
    const dialog = {
      open: jest.fn((_component, options: { data: XpertSettingsLoaderData }) => {
        // The shell is mounted before either request starts.
        expect(api.getTeam).not.toHaveBeenCalled()
        expect(bindings.get).not.toHaveBeenCalled()
        loader = options.data
        return ref
      })
    }
    const toastr = { error: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: AssistantBindingService, useValue: bindings },
        { provide: XpertAPIService, useValue: api },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: ToastrService, useValue: toastr },
        { provide: Dialog, useValue: dialog }
      ]
    })
    const service = TestBed.inject(XpertSettingsService)
    const opened = service.open(undefined, 'fixture')
    return { team, binding, organizations, changes, store, api, bindings, ref, dialog, toastr, service, opened, loader }
  }

  it.each(['team', 'binding'] as const)(
    'opens immediately and waits for both parallel requests (%s first)',
    async (first) => {
      const test = setup()
      expect(test.dialog.open).toHaveBeenCalledTimes(1)
      expect(test.loader.state().status).toBe('loading')
      expect(test.team.observed).toBe(true)
      expect(test.binding.observed).toBe(true)
      await test.service.open(undefined, 'fixture')
      expect(test.dialog.open).toHaveBeenCalledTimes(1)
      if (first === 'team') test.team.next({ id: 'fixture' })
      else test.binding.next(null)
      await settleLoad()
      expect(test.loader.state().status).toBe('loading')
      if (first === 'team') test.binding.next(null)
      else test.team.next({ id: 'fixture' })
      const data = await loaded(test.loader)
      expect(data.source.id).toBe('fixture')
      expect(data.binding).toBeNull()
      expect(test.dialog.open).toHaveBeenCalledTimes(1)
      test.ref.close()
      await test.opened
    }
  )

  it.each(['team', 'binding'] as const)(
    'shows %s failures, cancels the other request and retries in place',
    async (failed) => {
      const test = setup()
      test[failed].error(new Error('Connection unavailable'))
      await settleLoad()
      expect(test.loader.state()).toEqual({ status: 'error', message: 'Connection unavailable' })
      expect(test.team.observed).toBe(false)
      expect(test.binding.observed).toBe(false)
      expect(test.toastr.error).not.toHaveBeenCalled()
      const nextTeam = new Subject<IXpert>()
      const nextBinding = new Subject<IAssistantBinding | null>()
      test.api.getTeam.mockReturnValue(nextTeam)
      test.bindings.get.mockReturnValue(nextBinding)
      test.loader.retry()
      test.loader.retry()
      expect(test.loader.state().status).toBe('loading')
      expect(nextTeam.observed).toBe(true)
      expect(nextBinding.observed).toBe(true)
      expect(test.api.getTeam).toHaveBeenCalledTimes(2)
      expect(test.bindings.get).toHaveBeenCalledTimes(2)
      nextTeam.next({ id: 'fixture' })
      nextBinding.next(null)
      await loaded(test.loader)
      expect(test.dialog.open).toHaveBeenCalledTimes(1)
      test.ref.close()
      await test.opened
    }
  )

  it('keeps a repeated retry failure visible until the dialog is closed', async () => {
    const test = setup()
    test.team.error(new Error('Offline'))
    await settleLoad()
    test.api.getTeam.mockReturnValue(throwError(() => new Error('Still offline')))
    test.loader.retry()
    await settleLoad()
    expect(test.loader.state()).toEqual({ status: 'error', message: 'Still offline' })
    test.ref.close()
    expect(await test.opened).toBeUndefined()
  })

  it('uses a readable localized message for network failures', async () => {
    const test = setup()
    test.team.error(new HttpErrorResponse({ status: 0, url: '/api/xpert/fixture/team' }))
    await settleLoad()
    expect(test.loader.state()).toEqual({ status: 'error', message: 'XP.XpertSettings.NetworkError' })
    test.ref.close()
    await test.opened
  })

  it.each(['close', 'organization', 'binding'] as const)(
    'cancels loading on %s and ignores late responses',
    async (reason) => {
      const test = setup()
      if (reason === 'close') test.ref.close()
      else if (reason === 'organization') {
        test.store.organizationId = 'other-org'
        test.organizations.next('other-org')
      } else {
        test.changes.next({ code: AssistantCode.CLAWXPERT, scope: AssistantBindingScope.USER })
      }
      expect(await test.opened).toBeUndefined()
      expect(test.team.observed).toBe(false)
      expect(test.binding.observed).toBe(false)
      test.team.next({ id: 'fixture' })
      test.binding.next(null)
      test.loader.retry()
      await settleLoad()
      expect(test.loader.state().status).toBe('loading')
      expect(test.dialog.open).toHaveBeenCalledTimes(1)
      expect(test.api.getTeam).toHaveBeenCalledTimes(1)
      expect(test.toastr.error).not.toHaveBeenCalled()
    }
  )

  it('allows reopening after closing a pending load without the old load replacing the new state', async () => {
    const test = setup()
    test.ref.close()
    await test.opened
    const oldLoader = test.loader
    test.api.getTeam.mockClear().mockReturnValue(of({ id: 'next' }))
    test.bindings.get.mockClear().mockReturnValue(of(null))
    const reopened = test.service.open(undefined, 'next')
    const newLoader = test.dialog.open.mock.calls[1][1].data
    const data = await loaded(newLoader)
    expect(data.source.id).toBe('next')
    expect(oldLoader.state().status).toBe('loading')
    test.ref.close()
    await reopened
  })
})
