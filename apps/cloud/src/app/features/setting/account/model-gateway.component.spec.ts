import { DOCUMENT } from '@angular/common'
import { Clipboard } from '@angular/cdk/clipboard'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { Store } from '@cloud/app/@core/state'
import { AiModelTypeEnum, IModelGatewayCatalogItem, ModelGatewayApiKeyStatusEnum } from '@xpert-ai/contracts'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
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
        { provide: ZardDialogService, useValue: { open: jest.fn() } },
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
        { provide: ZardDialogService, useValue: {} },
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
