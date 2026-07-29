import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IModelAccessCatalogItem,
  IUserModelGrant,
  ModelAccessChannelEnum,
  ModelAccessOwnershipScopeEnum,
  ModelAccessSourceEnum,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
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

  it('groups available models and searches plan and direct models by model and provider labels', () => {
    const packageModel = catalogItem('package', {
      planIncluded: true,
      allowed: true,
      modelLabel: { en_US: 'Reasoning Pro' },
      providerLabel: { en_US: 'Provider Alpha' }
    })
    const grantedModel = catalogItem('granted', {
      allowed: true,
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

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ModelAccessService,
          useValue: {
            catalog$: of({
              items: [packageModel, grantedModel, directModel, requestableModel],
              canRequest: true,
              tenantFeatureEnabled: true,
              organizationFeatureEnabled: false
            }),
            myRequests$: of([]),
            myGrants$: of([grantedModel.grant]),
            formatValidUntil: jest.fn()
          }
        },
        { provide: ZardDialogService, useValue: { open: jest.fn() } },
        { provide: TranslateService, useValue: { instant: jest.fn((value: string) => value) } },
        { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new XpAccountAvailableModelsComponent())

    expect(component.availableModels()).toEqual([packageModel, directModel])
    expect(component.grantModels()).toEqual([grantedModel])
    expect(component.requestableModels()).toEqual([requestableModel])

    component.availableModelSearchControl.setValue('alpha')
    expect(component.filteredAvailableModels()).toEqual([packageModel])

    component.availableModelSearchControl.setValue('direct reasoner')
    expect(component.filteredAvailableModels()).toEqual([directModel])

    component.availableModelSearchControl.setValue('missing')
    expect(component.filteredAvailableModels()).toEqual([])
  })
})
