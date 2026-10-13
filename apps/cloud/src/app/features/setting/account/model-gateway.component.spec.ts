import { Dialog } from '@angular/cdk/dialog'
import { DOCUMENT } from '@angular/common'
import { Clipboard } from '@angular/cdk/clipboard'
import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Store } from '@cloud/app/@core/state'
import {
  AiModelTypeEnum,
  IModelAccessRequest,
  IModelGatewayApiKey,
  IModelGatewayCatalogItem,
  ModelAccessChannelEnum,
  ModelAccessOwnershipScopeEnum,
  ModelAccessRequestStatusEnum,
  ModelAccessUnavailableReasonEnum,
  ModelGatewayApiKeyLifetimeEnum,
  ModelGatewayApiKeyStatusEnum,
  ModelGatewayCallStatusEnum,
  ModelGatewayUsageSourceEnum,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { ModelGatewayService } from '../../../@core/services/model-gateway.service'
import { ToastrService } from '../../../@core/services/toastr.service'
import { XpAccountModelGatewayComponent } from './model-gateway.component'

function gatewayItem(id: string, input: Partial<IModelGatewayCatalogItem> = {}): IModelGatewayCatalogItem {
  return {
    id,
    copilotId: `${id}-copilot`,
    copilotModelId: `${id}-source`,
    provider: 'provider',
    modelType: AiModelTypeEnum.LLM,
    model: `${id}-model`,
    externalModelId: id,
    capabilities: [],
    deprecated: false,
    allowed: false,
    requestable: true,
    planIncluded: false,
    multiplier: 1,
    ...input
  }
}

describe('XpAccountModelGatewayComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('loads personal gateway data and filters external models without losing callability state', async () => {
    const available = gatewayItem('reasoning-pro', {
      provider: 'provider-alpha',
      allowed: true,
      requestable: false
    })
    const unavailable = gatewayItem('vision-pro', {
      provider: 'provider-beta',
      allowed: false,
      requestable: false,
      unavailableReason: 'quota_exhausted'
    })
    const getMyCalls = jest.fn().mockReturnValue(
      of({
        items: [
          {
            id: 'call-1',
            requestId: 'request-1',
            userId: 'user-1',
            apiKeyId: 'key-1',
            publicationId: available.id,
            externalModelId: available.externalModelId,
            provider: available.provider,
            model: available.model,
            status: 'succeeded',
            startedAt: '2026-07-28T00:00:00.000Z',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            chargedPoints: 1,
            excessPoints: 0,
            usageSource: 'provider'
          }
        ],
        total: 1
      })
    )

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ModelGatewayService,
          useValue: {
            getCatalog: jest.fn().mockReturnValue(
              of({
                items: [available, unavailable],
                eligible: true,
                tenantFeatureEnabled: true,
                organizationFeatureEnabled: false
              })
            ),
            getMyRequests: jest.fn().mockReturnValue(of([])),
            getMyGrants: jest.fn().mockReturnValue(of([])),
            getMyKeys: jest.fn().mockReturnValue(
              of([
                {
                  id: 'key-1',
                  userId: 'user-1',
                  name: 'Client',
                  prefix: 'sk-xpert',
                  status: ModelGatewayApiKeyStatusEnum.Active
                }
              ])
            ),
            getMyCalls
          }
        },
        { provide: Dialog, useValue: { open: jest.fn() } },
        { provide: TranslateService, useValue: { instant: jest.fn((value: string) => value) } },
        { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } },
        { provide: Store, useValue: { selectOrganizationId: jest.fn().mockReturnValue(of(null)) } },
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: {
              location: { origin: 'https://xpert.example' },
              navigator: { clipboard: { writeText: jest.fn() } }
            }
          }
        }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new XpAccountModelGatewayComponent())

    await component.load()

    expect(component.catalog()?.items).toEqual([available, unavailable])
    expect(component.catalog()?.items[1]).toMatchObject({
      allowed: false,
      unavailableReason: 'quota_exhausted'
    })
    expect(component.keys()).toHaveLength(1)
    expect(component.calls()).toHaveLength(1)
    expect(getMyCalls).toHaveBeenCalledWith(20, 0)

    component.modelSearchControl.setValue('beta')
    expect(component.filteredCatalogItems()).toEqual([unavailable])
  })

  it('uses the CDK clipboard fallback and reports the copy result without the native Clipboard API', () => {
    const copy = jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false)
    const toastr = { error: jest.fn(), success: jest.fn() }

    TestBed.configureTestingModule({
      providers: [
        { provide: Clipboard, useValue: { copy } },
        { provide: ModelGatewayService, useValue: {} },
        { provide: Dialog, useValue: {} },
        { provide: TranslateService, useValue: { instant: jest.fn((value: string) => value) } },
        { provide: ToastrService, useValue: toastr },
        { provide: Store, useValue: {} },
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: {
              location: { origin: 'http://10.151.251.15' },
              navigator: {}
            }
          }
        }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new XpAccountModelGatewayComponent())

    component.copy('first value')

    expect(copy).toHaveBeenCalledWith('first value')
    expect(toastr.success).toHaveBeenCalledWith('XP.ACTIONS.Copied')
    expect(toastr.error).not.toHaveBeenCalled()

    component.copy('second value')

    expect(copy).toHaveBeenCalledWith('second value')
    expect(toastr.error).toHaveBeenCalledWith('XP.ModelGateway.CopyFailed')
  })
})

const pendingRequest: IModelAccessRequest = {
  id: 'request-pending',
  requesterId: 'user-1',
  channel: ModelAccessChannelEnum.ExternalApi,
  copilotId: 'pending-copilot',
  copilotModelId: 'pending-model',
  provider: 'provider',
  modelType: AiModelTypeEnum.LLM,
  model: 'pending-model',
  ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
  modelSnapshot: {
    copilotId: 'pending-copilot',
    provider: 'provider',
    modelType: AiModelTypeEnum.LLM,
    model: 'pending-model',
    capturedAt: '2026-10-01T00:00:00Z'
  },
  reason: 'Use in my client',
  status: ModelAccessRequestStatusEnum.Requested,
  createdAt: '2026-10-01T00:00:00Z'
}

async function setupGatewayView(items: IModelGatewayCatalogItem[] = [], keys: IModelGatewayApiKey[] = []) {
  const service = {
    getCatalog: jest.fn(() =>
      of({ items, eligible: true, tenantFeatureEnabled: true, organizationFeatureEnabled: true })
    ),
    getMyRequests: jest.fn(() => of([pendingRequest])),
    getMyGrants: jest.fn(() => of([])),
    getMyKeys: jest.fn(() => of(keys)),
    getMyCalls: jest.fn(() =>
      of({
        items: [
          {
            id: 'call-1',
            requestId: 'trace-1',
            userId: 'user-1',
            apiKeyId: 'key-1',
            publicationId: 'model-1',
            externalModelId: 'model-1',
            provider: 'provider',
            model: 'model-1',
            status: ModelGatewayCallStatusEnum.Succeeded,
            startedAt: '2026-10-01T00:00:00Z',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            chargedPoints: 0,
            excessPoints: 0,
            usageSource: ModelGatewayUsageSourceEnum.Provider
          }
        ],
        total: 21
      })
    ),
    createRequest: jest.fn(() => of({})),
    withdrawRequest: jest.fn(() => of({})),
    createKey: jest.fn(() => of({})),
    revokeMyKey: jest.fn(() => of({}))
  }
  const dialog = { open: jest.fn().mockReturnValue({ closed: of(null) }) }
  const clipboard = { copy: jest.fn(() => true) }
  TestBed.configureTestingModule({
    imports: [XpAccountModelGatewayComponent, TranslateModule.forRoot()],
    providers: [
      { provide: ModelGatewayService, useValue: service },
      { provide: Dialog, useValue: dialog },
      { provide: Clipboard, useValue: clipboard },
      { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } },
      { provide: Store, useValue: { selectOrganizationId: () => of(null) } }
    ]
  })
  const fixture = TestBed.createComponent(XpAccountModelGatewayComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()
  const host: HTMLElement = fixture.nativeElement
  return { fixture, host, component: fixture.componentInstance, service, dialog, clipboard }
}

function buttonWithText(host: Element, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent.includes(text)
  )
  if (!button) throw new Error(`Missing button: ${text}`)
  return button
}

function modelRow(host: Element, id: string) {
  const row = [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')].find(
    (row) => row.querySelector('h2')?.textContent.trim() === id
  )
  if (!row) throw new Error(`Missing model row: ${id}`)
  return row
}

describe('external API settings interactions', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('masks existing secrets, copies the full value on the first click and only offers revocation for active keys', async () => {
    const activeKey: IModelGatewayApiKey = {
      id: 'key-1',
      userId: 'user-1',
      name: 'Desktop client',
      prefix: 'sk-test-',
      secret: 'test-only-secret',
      status: ModelGatewayApiKeyStatusEnum.Active
    }
    const view = await setupGatewayView(
      [],
      [
        activeKey,
        { ...activeKey, id: 'key-2', name: 'Legacy', secret: undefined, status: ModelGatewayApiKeyStatusEnum.Expired }
      ]
    )
    const rows = [...view.host.querySelectorAll('tbody tr')]
    expect(view.host.textContent).not.toContain(activeKey.secret)
    expect(rows[0].textContent).toContain('••••••••')
    rows[0].querySelector<HTMLButtonElement>('[aria-label="XP.ModelGatewaySettings.CopyKey"]')!.click()
    expect(view.clipboard.copy).toHaveBeenCalledWith(activeKey.secret)
    rows[0].querySelector<HTMLButtonElement>('[aria-label="XP.ModelGatewaySettings.ShowKey"]')!.click()
    view.fixture.detectChanges()
    expect(rows[0].textContent).toContain(activeKey.secret)
    rows[0].querySelector<HTMLButtonElement>('[aria-label="XP.ModelGatewaySettings.HideKey"]')!.click()
    view.fixture.detectChanges()
    expect(rows[0].textContent).not.toContain(activeKey.secret)
    expect(rows[1].textContent).toContain('XP.ModelGateway.LegacyKeyUnavailable')
    expect(rows[1].querySelector('button')).toBeNull()
    buttonWithText(rows[0], 'XP.ModelGateway.Revoke').click()
    await view.fixture.whenStable()
    expect(view.dialog.open).toHaveBeenCalled()
    expect(view.service.revokeMyKey).not.toHaveBeenCalled()
    view.fixture.destroy()
  })

  it('preserves requestable, pending and granted states and submits the original request and withdrawal payloads', async () => {
    const requested = gatewayItem('pending', { requestable: false, pendingRequest })
    const blocked = gatewayItem('blocked', {
      requestable: false,
      allowed: false,
      deprecated: true,
      unavailableReason: ModelAccessUnavailableReasonEnum.QuotaExhausted,
      grant: {
        ...pendingRequest,
        id: 'grant-1',
        userId: 'user-1',
        requestId: pendingRequest.id,
        status: UserModelGrantStatusEnum.Active,
        approvedAt: '2026-10-01T00:00:00Z'
      }
    })
    const candidate = gatewayItem('candidate')
    const view = await setupGatewayView([candidate, requested, blocked])
    view.component.selectedTabIndex.set(1)
    view.fixture.detectChanges()
    expect(modelRow(view.host, 'blocked').textContent).toContain('XP.ModelGateway.TemporarilyUnavailable')
    expect(modelRow(view.host, 'blocked').textContent).toContain('XP.KEY_WORDS.Deprecated')
    expect(modelRow(view.host, 'blocked').textContent).toContain('XP.ModelAccess.Unavailable.quota_exhausted')
    expect(
      [...modelRow(view.host, 'blocked').querySelectorAll('button')].every(
        (button) => button.getAttribute('aria-label') === 'XP.ModelGatewaySettings.CopyModelId'
      )
    ).toBe(true)
    expect(modelRow(view.host, 'pending').textContent).toContain('XP.ModelGateway.Pending')
    view.dialog.open.mockReturnValueOnce({ closed: of({ reason: 'External client' }) })
    buttonWithText(modelRow(view.host, 'candidate'), 'XP.ModelGateway.Apply').click()
    await view.fixture.whenStable()
    view.fixture.detectChanges()
    expect(view.service.createRequest).toHaveBeenCalledWith({
      copilotId: candidate.copilotId,
      copilotModelId: candidate.copilotModelId,
      modelType: candidate.modelType,
      reason: 'External client'
    })
    expect(view.host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(
      'XP.ModelGatewaySettings.ModelAccess'
    )
    view.dialog.open.mockReturnValueOnce({ closed: of({ reason: 'No longer needed' }) })
    buttonWithText(modelRow(view.host, 'pending'), 'XP.ModelGateway.Withdraw').click()
    await view.fixture.whenStable()
    expect(view.service.withdrawRequest).toHaveBeenCalledWith(pendingRequest.id, 'No longer needed')
    view.fixture.destroy()
  })

  it('keeps call history selected across pagination, shows a retryable failure and remasks secrets after reloading', async () => {
    const view = await setupGatewayView()
    view.component.selectedTabIndex.set(3)
    view.fixture.detectChanges()
    view.component.revealedKeys.set(new Set(['key-1']))
    buttonWithText(view.host.querySelector('[role="tabpanel"]:not([hidden])')!, 'XP.ModelGateway.NextPage').click()
    await view.fixture.whenStable()
    view.fixture.detectChanges()
    expect(view.service.getMyCalls).toHaveBeenLastCalledWith(20, 20)
    expect(view.host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(
      'XP.ModelGatewaySettings.Calls'
    )
    expect(view.component.revealedKeys().size).toBe(0)
    expect(
      buttonWithText(view.host.querySelector('[role="tabpanel"]:not([hidden])')!, 'XP.ModelGateway.NextPage').disabled
    ).toBe(true)
    view.service.getMyCalls.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    await view.component.load()
    view.fixture.detectChanges()
    expect(view.host.textContent).toContain('XP.ModelGatewaySettings.LoadFailed')
    expect(view.host.querySelector('table')).toBeNull()
    buttonWithText(view.host, 'XP.ACTIONS.Retry').click()
    await view.fixture.whenStable()
    view.fixture.detectChanges()
    expect(view.host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(
      'XP.ModelGatewaySettings.Calls'
    )
    expect(view.component.loadFailed()).toBe(false)
    view.fixture.destroy()
  })

  it('keeps creation lifetimes and revocation reasons while respecting cancelled dialogs', async () => {
    const key: IModelGatewayApiKey = {
      id: 'key-1',
      userId: 'user-1',
      name: 'Client',
      prefix: 'test',
      status: ModelGatewayApiKeyStatusEnum.Active
    }
    const view = await setupGatewayView([], [key])
    await view.component.createKey()
    expect(view.service.createKey).not.toHaveBeenCalled()
    view.dialog.open.mockReturnValueOnce({
      closed: of({ name: 'My client', lifetime: ModelGatewayApiKeyLifetimeEnum.Days30 })
    })
    await view.component.createKey()
    expect(view.service.createKey).toHaveBeenCalledWith({
      name: 'My client',
      lifetime: ModelGatewayApiKeyLifetimeEnum.Days30
    })
    view.dialog.open.mockReturnValueOnce({ closed: of({ reason: 'Rotate client key' }) })
    await view.component.revokeKey(key)
    expect(view.service.revokeMyKey).toHaveBeenCalledWith(key.id, { reason: 'Rotate client key' })
    view.fixture.destroy()
  })
})
