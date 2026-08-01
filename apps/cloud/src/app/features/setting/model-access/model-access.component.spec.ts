import { TestBed } from '@angular/core/testing'
import {
  AIPermissionsEnum,
  ModelAccessChannelEnum,
  ModelAccessRequestStatusEnum,
  RequestScopeLevel
} from '@xpert-ai/contracts'
import { Store } from '@cloud/app/@core/state'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of } from 'rxjs'
import { ModelAccessService } from '../../../@core/services/model-access.service'
import { ToastrService } from '../../../@core/services/toastr.service'
import { ModelAccessAdminComponent } from './model-access.component'

describe('ModelAccessAdminComponent', () => {
  let service: {
    getAdminRequests: jest.Mock
    getAdminGrants: jest.Mock
    getAdminEvents: jest.Mock
    approveRequest: jest.Mock
    rejectRequest: jest.Mock
    extendGrant: jest.Mock
    revokeGrant: jest.Mock
  }
  let activeScope$: BehaviorSubject<{ level: RequestScopeLevel; organizationId?: string }>
  let store: { hasPermission: jest.Mock; selectActiveScope: jest.Mock }
  let dialog: { open: jest.Mock }
  let component: ModelAccessAdminComponent

  beforeEach(async () => {
    service = {
      getAdminRequests: jest.fn(() => of({ items: [{ id: 'request-1' }], total: 101 })),
      getAdminGrants: jest.fn(() => of({ items: [{ id: 'grant-1' }], total: 102 })),
      getAdminEvents: jest.fn(() => of({ items: [{ id: 'event-1' }], total: 103 })),
      approveRequest: jest.fn(() => of({ id: 'grant-1' })),
      rejectRequest: jest.fn(() => of({ id: 'request-1' })),
      extendGrant: jest.fn(() => of({ id: 'grant-1' })),
      revokeGrant: jest.fn(() => of({ id: 'grant-1' }))
    }
    activeScope$ = new BehaviorSubject({
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: 'org-1'
    })
    store = {
      hasPermission: jest.fn(() => true),
      selectActiveScope: jest.fn(() => activeScope$)
    }
    dialog = {
      open: jest.fn()
    }
    await TestBed.configureTestingModule({
      imports: [ModelAccessAdminComponent],
      providers: [
        { provide: ModelAccessService, useValue: service },
        { provide: Store, useValue: store },
        { provide: ZardDialogService, useValue: dialog },
        { provide: ToastrService, useValue: { error: jest.fn() } }
      ]
    })
      .overrideComponent(ModelAccessAdminComponent, {
        set: {
          template: ''
        }
      })
      .compileComponents()

    component = TestBed.createComponent(ModelAccessAdminComponent).componentInstance
  })

  it('loads filtered request, grant, and audit data while preserving server totals', async () => {
    component.filterForm.setValue({
      channel: ModelAccessChannelEnum.ExternalApi,
      search: '  qwen  ',
      modelType: 'llm',
      status: ModelAccessRequestStatusEnum.Requested,
      expiresBefore: new Date(2027, 2, 14)
    })

    await component.load()

    expect(service.getAdminRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: ModelAccessChannelEnum.ExternalApi,
        search: 'qwen',
        modelType: 'llm',
        status: ModelAccessRequestStatusEnum.Requested,
        take: 20,
        skip: 0
      })
    )
    expect(service.getAdminGrants).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: ModelAccessChannelEnum.ExternalApi,
        search: 'qwen',
        expiresBefore: '2027-03-14',
        take: 20,
        skip: 0
      })
    )
    expect(service.getAdminEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: ModelAccessChannelEnum.ExternalApi,
        search: 'qwen',
        take: 20,
        skip: 0
      })
    )
    expect(component.requestTotal()).toBe(101)
    expect(component.grantTotal()).toBe(102)
    expect(component.eventTotal()).toBe(103)
  })

  it('loads each management list with its own server-side page offset', async () => {
    component.requestPageIndex.set(1)
    component.grantPageIndex.set(2)
    component.eventPageIndex.set(3)

    await component.load()

    expect(service.getAdminRequests).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 20 }))
    expect(service.getAdminGrants).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 40 }))
    expect(service.getAdminEvents).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 60 }))
  })

  it('updates only the active tab page and reloads its server-side data', () => {
    const load = jest.spyOn(component, 'load').mockResolvedValue(undefined)
    component.setTab('grants')
    component.grantTotal.set(102)

    component.onPage(3)

    expect(component.requestPageIndex()).toBe(0)
    expect(component.grantPageIndex()).toBe(2)
    expect(component.eventPageIndex()).toBe(0)
    expect(load).toHaveBeenCalled()
  })

  it('keeps edit actions disabled for a view-only administrator', () => {
    store.hasPermission.mockImplementation((permission) => permission === AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW)

    expect(component.canEdit()).toBe(false)
    expect(store.hasPermission).toHaveBeenCalledWith(AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
  })

  it('fills the available settings content width', () => {
    const fixture = TestBed.createComponent(ModelAccessAdminComponent)

    expect(fixture.nativeElement.classList).toContain('flex-1')
    expect(fixture.nativeElement.classList).toContain('w-full')
    expect(fixture.nativeElement.classList).toContain('min-w-0')
  })

  it('reloads management lists when the active scope changes', () => {
    const load = jest.spyOn(component, 'load').mockResolvedValue(undefined)

    component.ngOnInit()
    activeScope$.next({ level: RequestScopeLevel.TENANT })

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shows the target scope for audit events instead of the actor scope', () => {
    expect(component.eventScope({ organizationId: 'org-1' })).toBe('organization')
    expect(component.eventScope({ organizationId: null })).toBe('tenant')
  })

  it('approves a request and reloads all management lists', async () => {
    dialog.open.mockReturnValue({
      closed: of({
        validUntil: '2027-03-14',
        note: 'Approved'
      })
    })
    const load = jest.spyOn(component, 'load').mockResolvedValue(undefined)

    await component.approve({ id: 'request-1' } as never)

    expect(service.approveRequest).toHaveBeenCalledWith('request-1', {
      validUntil: '2027-03-14',
      note: 'Approved'
    })
    expect(load).toHaveBeenCalled()
  })
})
