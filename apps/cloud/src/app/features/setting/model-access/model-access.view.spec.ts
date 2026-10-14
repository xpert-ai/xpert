import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IModelAccessEvent,
  IModelAccessRequest,
  IUserModelGrant,
  ModelAccessActorTypeEnum,
  ModelAccessChannelEnum,
  ModelAccessEventTypeEnum,
  ModelAccessOwnershipScopeEnum,
  ModelAccessRequestStatusEnum,
  ModelAccessUnavailableReasonEnum,
  RequestScopeLevel,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { Store } from '@cloud/app/@core/state'
import { BehaviorSubject, of, throwError } from 'rxjs'
import { ModelAccessService } from '../../../@core/services/model-access.service'
import { ToastrService } from '../../../@core/services/toastr.service'
import { ModelAccessAdminComponent } from './model-access.component'

const snapshot = {
  copilotId: 'copilot',
  provider: 'provider',
  providerLabel: { en_US: 'Example provider' },
  modelType: AiModelTypeEnum.LLM,
  model: 'model',
  modelLabel: { en_US: 'Example model' },
  externalModelId: 'api-model',
  capturedAt: '2026-10-13T10:00:00Z'
}
const request: IModelAccessRequest = {
  id: 'request',
  requesterId: 'alice',
  requesterName: 'Alice',
  copilotId: 'copilot',
  copilotModelId: 'model-id',
  channel: ModelAccessChannelEnum.ExternalApi,
  provider: 'provider',
  modelType: AiModelTypeEnum.LLM,
  model: 'model',
  ownershipScope: ModelAccessOwnershipScopeEnum.Organization,
  reason: 'Evaluate the model',
  status: ModelAccessRequestStatusEnum.Requested,
  externalModelId: 'api-model',
  modelSnapshot: snapshot,
  createdAt: new Date('2026-10-13T10:00:00Z')
}
const grant: IUserModelGrant = {
  id: 'grant',
  userId: 'alice',
  userName: 'Alice',
  requestId: 'request',
  copilotId: 'copilot',
  copilotModelId: 'model-id',
  channel: ModelAccessChannelEnum.ExternalApi,
  provider: 'provider',
  modelType: AiModelTypeEnum.LLM,
  model: 'model',
  ownershipScope: ModelAccessOwnershipScopeEnum.Organization,
  status: UserModelGrantStatusEnum.Active,
  modelSnapshot: snapshot,
  approvedAt: '2026-10-13T10:00:00Z',
  validUntil: '2027-03-14'
}
const event: IModelAccessEvent = {
  id: 'event',
  channel: ModelAccessChannelEnum.ExternalApi,
  organizationId: null,
  eventType: ModelAccessEventTypeEnum.ModelSuspended,
  actorType: ModelAccessActorTypeEnum.System,
  actorScope: ModelAccessOwnershipScopeEnum.Organization,
  idempotencyKey: 'event',
  modelSnapshot: snapshot,
  reason: ModelAccessUnavailableReasonEnum.ModelDisabled,
  createdAt: new Date('2026-10-13T10:00:00Z')
}

describe('Model access settings view', () => {
  let fixture: ComponentFixture<ModelAccessAdminComponent>
  let component: ModelAccessAdminComponent
  let root: HTMLElement
  let edit: ReturnType<typeof signal<boolean>>
  let service: {
    getAdminRequests: jest.Mock
    getAdminGrants: jest.Mock
    getAdminEvents: jest.Mock
    formatValidUntil: jest.Mock
  }
  let dialog: { open: jest.Mock }

  beforeEach(async () => {
    edit = signal(true)
    service = {
      getAdminRequests: jest.fn(() => of({ items: [request], total: 1 })),
      getAdminGrants: jest.fn(() => of({ items: [grant], total: 1 })),
      getAdminEvents: jest.fn(() => of({ items: [event], total: 1 })),
      formatValidUntil: jest.fn((value) => value)
    }
    dialog = { open: jest.fn(() => ({ closed: of(null) })) }
    await TestBed.configureTestingModule({
      imports: [ModelAccessAdminComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: ModelAccessService, useValue: service },
        { provide: Dialog, useValue: dialog },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        {
          provide: Store,
          useValue: {
            hasPermission: () => edit(),
            selectActiveScope: () => new BehaviorSubject({ level: RequestScopeLevel.ORGANIZATION })
          }
        }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(ModelAccessAdminComponent)
    component = fixture.componentInstance
    root = fixture.nativeElement
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  })

  afterEach(() => TestBed.resetTestingModule())

  const buttons = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('tbody button')).map((button) => button.textContent.trim())

  it('renders request context and exposes review actions only for pending requests with edit permission', async () => {
    expect(root.querySelectorAll('thead th')).toHaveLength(7)
    for (const text of [
      'Alice',
      'Example model',
      'Example provider',
      'api-model',
      'Evaluate the model',
      'XP.ModelAccess.Scope.organization'
    ]) {
      expect(root.textContent).toContain(text)
    }
    expect(root.querySelector('z-date-picker')).toBeNull()
    expect(buttons(root)).toEqual(['XP.ModelAccess.Reject', 'XP.ModelAccess.Approve'])
    await component.approve(request)
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          mode: 'approve',
          target: expect.objectContaining({ userName: 'Alice', reason: request.reason, modelSnapshot: snapshot })
        })
      })
    )
    component.requests.set([{ ...request, status: ModelAccessRequestStatusEnum.Approved }])
    fixture.detectChanges()
    expect(buttons(root)).toEqual([])
    component.requests.set([request])
    edit.set(false)
    fixture.detectChanges()
    expect(buttons(root)).toEqual([])
    expect(root.textContent).toContain('XP.ModelAccessSettings.ReadOnly')
  })

  it('retains expiration and availability, allowing extension only for active grants with an expiration', () => {
    component.setTab('grants')
    fixture.detectChanges()
    expect(root.querySelector('z-date-picker')).not.toBeNull()
    expect(buttons(root)).toEqual(['XP.ModelAccess.Revoke', 'XP.ModelAccess.Extend'])
    expect(root.textContent).toContain('2027-03-14')
    component.grants.set([{ ...grant, validUntil: null }])
    fixture.detectChanges()
    expect(buttons(root)).toEqual(['XP.ModelAccess.Revoke'])
    expect(root.textContent).toContain('XP.ModelAccess.Permanent')
    component.grants.set([{ ...grant, status: UserModelGrantStatusEnum.Revoked }])
    fixture.detectChanges()
    expect(buttons(root)).toEqual([])
    expect(root.textContent).toContain('XP.ModelAccess.Unavailable.grant_revoked')
    component.grants.set([grant])
    edit.set(false)
    fixture.detectChanges()
    expect(buttons(root)).toEqual([])
  })

  it('renders audit actor, target scope and localized reason without inapplicable filters or actions', () => {
    component.setTab('audit')
    fixture.detectChanges()
    expect(root.querySelectorAll('thead th')).toHaveLength(6)
    expect(root.querySelector('z-date-picker')).toBeNull()
    expect(root.querySelector('[formControlName="status"]')).toBeNull()
    expect(buttons(root)).toEqual([])
    for (const text of [
      'XP.ModelAccess.SystemActor',
      'XP.ModelAccess.Scope.tenant',
      'XP.ModelAccess.Unavailable.model_disabled',
      'api-model'
    ]) {
      expect(root.textContent).toContain(text)
    }
  })

  it('separates filtered empty results from loading failures and allows retry', async () => {
    service.getAdminRequests.mockReturnValue(of({ items: [], total: 0 }))
    component.filterForm.controls.search.setValue('missing')
    await component.load()
    fixture.detectChanges()
    expect(root.textContent).toContain('XP.ModelAccessSettings.NoResults')
    expect(root.textContent).toContain('XP.ModelAccessSettings.ClearFilters')
    service.getAdminRequests.mockReturnValue(throwError(() => new Error('Unavailable')))
    await component.load()
    fixture.detectChanges()
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('XP.ModelAccessSettings.LoadFailed')
    expect(root.textContent).not.toContain('XP.ModelAccessSettings.NoResultsHint')
    service.getAdminRequests.mockReturnValue(of({ items: [request], total: 1 }))
    root.querySelector<HTMLButtonElement>('[role="alert"] button')?.click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1)
  })
})
