import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ZardTabGroupComponent } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IAiProviderEntity,
  IModelAccessCatalog,
  IModelAccessCatalogItem,
  IModelAccessRequest,
  ModelAccessActorTypeEnum,
  ModelAccessEventTypeEnum,
  ModelAccessRequestStatusEnum,
  ModelAccessUnavailableReasonEnum,
  IUserModelGrant,
  ModelAccessChannelEnum,
  ModelAccessOwnershipScopeEnum,
  ModelAccessSourceEnum,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { BehaviorSubject, defer, of, throwError } from 'rxjs'
import { CopilotServerService } from '../../../@core/services/copilot-server.service'
import { ModelAccessService } from '../../../@core/services/model-access.service'
import { ToastrService } from '../../../@core/services/toastr.service'
import { XpAccountAvailableModelsComponent } from './available-models.component'

function catalogItem(key: string, input: Partial<IModelAccessCatalogItem> = {}): IModelAccessCatalogItem {
  return {
    key,
    channel: ModelAccessChannelEnum.Xpert,
    copilotId: `${key}-copilot`,
    copilotModelId: `${key}-model`,
    provider: 'provider',
    modelType: AiModelTypeEnum.LLM,
    model: `${key}-model`,
    ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
    planIncluded: false,
    allowed: false,
    requestable: false,
    ...input
  }
}

function activeGrant(key: string): IUserModelGrant {
  return {
    id: `${key}-grant`,
    channel: ModelAccessChannelEnum.Xpert,
    userId: 'user-1',
    requestId: `${key}-request`,
    copilotId: `${key}-copilot`,
    copilotModelId: `${key}-model`,
    provider: 'provider',
    modelType: AiModelTypeEnum.LLM,
    model: `${key}-model`,
    ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
    status: UserModelGrantStatusEnum.Active,
    approvedAt: '2026-07-28T00:00:00.000Z',
    modelSnapshot: {
      copilotId: `${key}-copilot`,
      provider: 'provider',
      modelType: AiModelTypeEnum.LLM,
      model: `${key}-model`,
      capturedAt: '2026-07-28T00:00:00.000Z'
    }
  }
}

describe('XpAccountAvailableModelsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('loads the catalog on page entry, keeps permission filters, and subscribes only once', () => {
    const packageModel = catalogItem('package', {
      planIncluded: true,
      allowed: true,
      modelLabel: { en_US: 'Reasoning Pro' },
      providerLabel: { en_US: 'Provider Alpha' }
    })
    const grantedModel = catalogItem('granted', {
      allowed: true,
      planIncluded: true,
      accessSource: ModelAccessSourceEnum.Grant,
      grant: activeGrant('granted')
    })
    const directModel = catalogItem('direct', {
      allowed: true,
      accessSource: ModelAccessSourceEnum.Direct,
      ownershipScope: ModelAccessOwnershipScopeEnum.Organization,
      modelLabel: { en_US: 'Direct Reasoner' }
    })
    const requestableModel = catalogItem('requestable', { requestable: true })

    let catalogSubscriptions = 0
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ModelAccessService,
          useValue: {
            catalog$: defer(() => {
              catalogSubscriptions++
              return of({
                items: [packageModel, grantedModel, directModel, requestableModel],
                canRequest: true,
                tenantFeatureEnabled: true,
                organizationFeatureEnabled: false
              })
            }),
            myRequests$: of([]),
            myGrants$: of([grantedModel.grant]),
            formatValidUntil: jest.fn()
          }
        },
        { provide: CopilotServerService, useValue: { getAiProviders: () => of([]), getCopilotModels: () => of([]) } },
        { provide: Dialog, useValue: { open: jest.fn() } },
        { provide: TranslateService, useValue: { instant: jest.fn((value: string) => value) } },
        { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new XpAccountAvailableModelsComponent())

    expect(catalogSubscriptions).toBe(0)
    expect(component.requestAvailability()).toBeNull()
    expect(component.availableModels()).toEqual([])
    expect(component.grantModels()).toEqual([grantedModel.grant])

    component.ngOnInit()

    expect(catalogSubscriptions).toBe(1)
    expect(component.requestAvailability()).toBe(true)
    expect(component.availableModels()).toEqual([packageModel, grantedModel, directModel])
    expect(component.grantModels()).toEqual([grantedModel.grant])
    expect(component.requestableModels()).toEqual([requestableModel])

    component.loadAvailableModels()
    expect(catalogSubscriptions).toBe(1)

    component.availableModelSearchControl.setValue('alpha')
    expect(component.filteredAvailableModels()).toEqual([packageModel])

    component.availableModelSearchControl.setValue('direct reasoner')
    expect(component.filteredAvailableModels()).toEqual([directModel])

    component.availableModelSearchControl.setValue('missing')
    expect(component.filteredAvailableModels()).toEqual([])

    component.clearFilters()
    component.modelTypeControl.setValue(AiModelTypeEnum.TEXT_EMBEDDING)
    expect(component.filteredAvailableModels()).toEqual([])
    component.clearFilters()
    expect(component.filteredAvailableModels()).toEqual([packageModel, grantedModel, directModel])

    component.catalog.set({
      items: [],
      canRequest: false,
      tenantFeatureEnabled: true,
      organizationFeatureEnabled: false
    })
    expect(component.requestAvailability()).toBe(false)
  })
})

function requestItem(key: string, status: ModelAccessRequestStatusEnum): IModelAccessRequest {
  const grant = activeGrant(key)
  return {
    id: grant.requestId,
    requesterId: 'user-1',
    channel: ModelAccessChannelEnum.Xpert,
    copilotId: grant.copilotId,
    copilotModelId: grant.copilotModelId,
    provider: grant.provider,
    modelType: grant.modelType,
    model: grant.model,
    ownershipScope: grant.ownershipScope,
    modelSnapshot: grant.modelSnapshot,
    reason: 'Business need with full details',
    status,
    createdAt: new Date('2026-10-01T00:00:00Z')
  }
}

function setupView(requests: IModelAccessRequest[] = [], grants: IUserModelGrant[] = [], canRequest = false) {
  const model = catalogItem('direct', { accessSource: ModelAccessSourceEnum.Direct, allowed: true })
  const requestable = catalogItem('candidate', { requestable: true })
  const catalog = new BehaviorSubject<IModelAccessCatalog>({
    items: canRequest ? [model, requestable] : [model],
    canRequest,
    tenantFeatureEnabled: true,
    organizationFeatureEnabled: true
  })
  const requestStream = new BehaviorSubject(requests)
  const grantStream = new BehaviorSubject(grants)
  const providers = new BehaviorSubject<IAiProviderEntity[]>([])
  const dialog = { open: jest.fn().mockReturnValue({ closed: of(null) }) }
  const service = {
    catalog$: catalog,
    myRequests$: requestStream,
    myGrants$: grantStream,
    formatValidUntil: jest.fn(() => 'Tenant timezone expiry'),
    createRequest: jest.fn(() => of({})),
    withdrawRequest: jest.fn(() => of({}))
  }
  TestBed.configureTestingModule({
    imports: [XpAccountAvailableModelsComponent, TranslateModule.forRoot()],
    providers: [
      { provide: ModelAccessService, useValue: service },
      { provide: CopilotServerService, useValue: { getAiProviders: () => providers, getCopilotModels: () => of([]) } },
      { provide: Dialog, useValue: dialog },
      { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } }
    ]
  })
  const fixture = TestBed.createComponent(XpAccountAvailableModelsComponent)
  fixture.detectChanges()
  const host: HTMLElement = fixture.nativeElement
  const tabs: ZardTabGroupComponent = fixture.debugElement.query(By.directive(ZardTabGroupComponent)).componentInstance
  return {
    fixture,
    component: fixture.componentInstance,
    host,
    tabs,
    catalog,
    requestStream,
    grantStream,
    dialog,
    service,
    requestable,
    providers
  }
}

describe('available model settings interactions', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('collapses groups independently, supports keyboard expansion and reveals matches after filtering', () => {
    const view = setupView()
    const group = view.host.querySelector('z-accordion-item')!
    const header = group.querySelector<HTMLElement>('z-accordion-header')!
    expect(header.getAttribute('aria-expanded')).toBe('true')
    header.click()
    view.fixture.detectChanges()
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(group.querySelector('[inert][aria-hidden="true"]')).not.toBeNull()
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    view.fixture.detectChanges()
    expect(header.getAttribute('aria-expanded')).toBe('true')
    header.click()
    view.fixture.detectChanges()
    view.component.availableModelSearchControl.setValue('direct')
    view.fixture.detectChanges()
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(group.querySelector('[inert]')).toBeNull()
    header.click()
    view.fixture.detectChanges()
    view.tabs.selectedIndex = 1
    view.fixture.detectChanges()
    view.tabs.selectedIndex = 0
    view.fixture.detectChanges()
    expect(header.getAttribute('aria-expanded')).toBe('false')
    view.component.modelTypeControl.setValue(AiModelTypeEnum.LLM)
    view.fixture.detectChanges()
    expect(header.getAttribute('aria-expanded')).toBe('true')
    view.fixture.destroy()
  })

  it('groups by provider identity, enriches logos without blocking the catalog, and keeps all eligible entries', () => {
    const view = setupView()
    const first = catalogItem('alpha-tenant', {
      provider: 'alpha',
      providerLabel: { en_US: 'Shared name' },
      planIncluded: true
    })
    const second = catalogItem('beta', {
      provider: 'beta',
      providerLabel: { en_US: 'Shared name' },
      accessSource: ModelAccessSourceEnum.Direct
    })
    const third = catalogItem('alpha-org', {
      ...first,
      key: 'alpha-org',
      ownershipScope: ModelAccessOwnershipScopeEnum.Organization,
      modelType: AiModelTypeEnum.TEXT_EMBEDDING
    })
    const hidden = catalogItem('hidden', { provider: 'unavailable', requestable: true })
    view.catalog.next({
      items: [first, second, third, hidden],
      canRequest: true,
      tenantFeatureEnabled: true,
      organizationFeatureEnabled: true
    })
    view.fixture.detectChanges()
    expect(view.component.providerGroups().map((group) => [group.provider, group.items])).toEqual([
      ['alpha', [first, third]],
      ['beta', [second]]
    ])
    expect(view.host.querySelectorAll('z-accordion-item')).toHaveLength(2)
    expect(view.host.querySelectorAll('z-accordion-item tr[xpAvailableModelRow]')).toHaveLength(3)
    expect(view.host.querySelector('z-avatar img')).toBeNull()

    const icon = { en_US: '/assets/alpha.svg' }
    view.providers.next([
      {
        provider: 'alpha',
        label: { en_US: 'Alpha' },
        description: {},
        icon_small: icon,
        icon_large: icon,
        background: '',
        help: { title: {}, url: {} },
        supported_model_types: [AiModelTypeEnum.LLM],
        configurate_methods: [],
        model_credential_schema: { credential_form_schemas: [] },
        provider_credential_schema: { credential_form_schemas: [] },
        models: []
      }
    ])
    view.fixture.detectChanges()
    expect(view.component.providerGroups()[0].icon).toEqual(icon)
    expect(view.host.querySelector('z-avatar img')?.getAttribute('src')).toBe('/assets/alpha.svg')
    view.host.querySelector('z-avatar img')?.dispatchEvent(new Event('error'))
    view.fixture.detectChanges()
    expect(view.host.querySelector('z-avatar img')).toBeNull()
    expect(view.host.querySelector('z-avatar')?.textContent?.trim()).toBe('S')

    view.component.modelTypeControl.setValue(AiModelTypeEnum.TEXT_EMBEDDING)
    expect(view.component.providerGroups().map((group) => group.items)).toEqual([[third]])
    view.component.availableModelSearchControl.setValue('beta')
    expect(view.component.providerGroups()).toEqual([])
    view.component.clearFilters()
    view.component.availableModelSearchControl.setValue('beta')
    expect(view.component.providerGroups().map((group) => group.items)).toEqual([[second]])
    view.fixture.destroy()
  })

  it('preserves current grant status, pending-only withdrawal, expiry formatting and request history', () => {
    const pending = requestItem('pending', ModelAccessRequestStatusEnum.Requested)
    const approved = requestItem('approved', ModelAccessRequestStatusEnum.Approved)
    approved.events = [
      {
        id: 'event-1',
        channel: ModelAccessChannelEnum.Xpert,
        eventType: ModelAccessEventTypeEnum.ModelSuspended,
        actorType: ModelAccessActorTypeEnum.System,
        actorScope: ModelAccessOwnershipScopeEnum.Tenant,
        reason: ModelAccessUnavailableReasonEnum.ModelDisabled,
        idempotencyKey: 'event-1',
        modelSnapshot: approved.modelSnapshot,
        createdAt: new Date('2026-10-02T00:00:00Z')
      }
    ]
    const active = {
      ...activeGrant('active'),
      validUntil: '2027-01-01T00:00:00Z',
      lastUnavailableReason: ModelAccessUnavailableReasonEnum.FeatureDisabled
    }
    const revoked = { ...activeGrant('approved'), status: UserModelGrantStatusEnum.Revoked }
    const view = setupView([pending, approved], [active, revoked])
    view.tabs.selectedIndex = 1
    view.fixture.detectChanges()
    const panel = view.host.querySelector<HTMLElement>('[role="tabpanel"][data-active="true"]')!
    const withdrawButtons = [...panel.querySelectorAll('button')].filter((button) =>
      button.textContent?.includes('XP.ModelAccess.Withdraw')
    )
    expect(withdrawButtons).toHaveLength(1)
    expect(panel.textContent).toContain('XP.ModelAccess.StatusValue.revoked')
    expect(view.component.grantModels()).toEqual([active])
    view.component.toggleRequest(approved)
    view.fixture.detectChanges()
    expect(panel.textContent).toContain('XP.ModelAccess.Event.model_suspended')
    expect(panel.textContent).toContain('XP.ModelAccess.Unavailable.model_disabled')
    expect(panel.textContent).toContain('XP.ModelAccess.SystemActor')
    expect(panel.querySelector('button[aria-expanded="true"]')).not.toBeNull()
    view.tabs.selectedIndex = 2
    view.fixture.detectChanges()
    expect(view.service.formatValidUntil).toHaveBeenCalledWith(active.validUntil)
    expect(view.host.textContent).toContain('Tenant timezone expiry')
    expect(view.host.textContent).toContain('XP.ModelAccess.Unavailable.feature_disabled')
    view.fixture.destroy()
  })

  it('uses only requestable candidates, keeps the request payload, and does not submit cancelled dialogs', async () => {
    const view = setupView([], [], true)
    await view.component.apply()
    expect(view.dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { items: [view.requestable] } })
    )
    expect(view.service.createRequest).not.toHaveBeenCalled()
    view.dialog.open.mockReturnValueOnce({ closed: of({ item: view.requestable, reason: 'Business need' }) })
    await view.component.apply()
    expect(view.service.createRequest).toHaveBeenCalledWith({
      copilotId: view.requestable.copilotId,
      copilotModelId: view.requestable.copilotModelId,
      modelType: view.requestable.modelType,
      reason: 'Business need'
    })
    const pending = requestItem('pending', ModelAccessRequestStatusEnum.Requested)
    await view.component.withdraw(pending)
    expect(view.service.withdrawRequest).not.toHaveBeenCalled()
    view.dialog.open.mockReturnValueOnce({ closed: of({ reason: 'No longer needed' }) })
    await view.component.withdraw(pending)
    expect(view.service.withdrawRequest).toHaveBeenCalledWith(pending.id, { reason: 'No longer needed' })
    view.catalog.next({ items: [], canRequest: false, tenantFeatureEnabled: false, organizationFeatureEnabled: false })
    view.fixture.detectChanges()
    const calls = view.dialog.open.mock.calls.length
    await view.component.apply()
    expect(view.dialog.open).toHaveBeenCalledTimes(calls)
    expect(
      [...view.host.querySelectorAll('button')].some((button) => button.textContent?.includes('XP.ModelAccess.Apply'))
    ).toBe(false)
    view.fixture.destroy()
  })

  it('retains search and type filters across tabs and follows live catalog updates', () => {
    const view = setupView()
    view.component.availableModelSearchControl.setValue('missing')
    view.component.modelTypeControl.setValue(AiModelTypeEnum.TEXT_EMBEDDING)
    view.fixture.detectChanges()
    view.tabs.selectedIndex = 1
    view.fixture.detectChanges()
    view.tabs.selectedIndex = 0
    view.fixture.detectChanges()
    expect(view.component.availableModelSearchControl.value).toBe('missing')
    expect(view.component.modelTypeControl.value).toBe(AiModelTypeEnum.TEXT_EMBEDDING)
    const panel = view.host.querySelector<HTMLElement>('[role="tabpanel"][data-active="true"]')!
    panel.querySelector<HTMLButtonElement>('z-empty button')?.click()
    view.fixture.detectChanges()
    expect(view.component.filteredAvailableModels()).toHaveLength(1)
    const changed = catalogItem('new-scope', {
      planIncluded: true,
      unavailableReason: ModelAccessUnavailableReasonEnum.QuotaExhausted
    })
    view.catalog.next({
      items: [changed],
      canRequest: false,
      tenantFeatureEnabled: true,
      organizationFeatureEnabled: true
    })
    view.fixture.detectChanges()
    expect(view.component.filteredAvailableModels()).toEqual([changed])
    expect(panel.textContent).toContain('new-scope-model')
    expect(panel.textContent).toContain('XP.ModelAccess.Unavailable.quota_exhausted')
    expect(panel.textContent).not.toContain('direct-model')
    view.fixture.destroy()
  })

  it('retries failed state and catalog streams instead of showing an empty list as success', () => {
    let failed = true
    const catalog: IModelAccessCatalog = {
      items: [catalogItem('recovered', { planIncluded: true })],
      canRequest: false,
      tenantFeatureEnabled: true,
      organizationFeatureEnabled: true
    }
    TestBed.configureTestingModule({
      imports: [XpAccountAvailableModelsComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ModelAccessService,
          useValue: {
            catalog$: defer(() => (failed ? throwError(() => new Error('Unavailable')) : of(catalog))),
            myRequests$: defer(() => (failed ? throwError(() => new Error('Unavailable')) : of([]))),
            myGrants$: of([])
          }
        },
        { provide: CopilotServerService, useValue: { getAiProviders: () => of([]), getCopilotModels: () => of([]) } },
        { provide: Dialog, useValue: { open: jest.fn() } },
        { provide: ToastrService, useValue: { error: jest.fn() } }
      ]
    })
    const fixture = TestBed.createComponent(XpAccountAvailableModelsComponent)
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    expect(host.textContent).toContain('XP.ModelAccess.LoadFailed')
    expect(host.textContent).not.toContain('XP.ModelAccess.NoAvailableModels')
    failed = false
    host.querySelector<HTMLButtonElement>('z-empty button')?.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.catalogLoadFailed()).toBe(false)
    expect(host.textContent).toContain('recovered-model')
    fixture.destroy()
  })
})
