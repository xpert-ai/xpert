import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject } from 'rxjs'

const organizationId$ = new BehaviorSubject<string | null>('org-1')
const storeMock = {
  selectOrganizationId: jest.fn(() => organizationId$.asObservable())
}

jest.mock('@xpert-ai/core', () => {
  const { HttpParams } = require('@angular/common/http')

  return {
    toParams: (params: Record<string, string>) =>
      new HttpParams({
        fromObject: params
      })
  }
})

jest.mock('@xpert-ai/cloud/state', () => {
  const { HttpClient } = require('@angular/common/http')
  const { inject } = require('@angular/core')

  class MockStore {}

  class MockOrganizationBaseCrudService<T> {
    protected readonly httpClient = inject(HttpClient)
    protected readonly store = inject(MockStore)

    constructor(protected apiBaseUrl: string) {}

    selectOrganizationId() {
      return this.store.selectOrganizationId()
    }
  }

  return {
    API_PREFIX: '/api',
    OrganizationBaseCrudService: MockOrganizationBaseCrudService,
    Store: MockStore
  }
})

jest.mock('../types', () => ({
  AiModelTypeEnum: {
    LLM: 'llm'
  },
  AiProviderRole: {
    Primary: 'primary'
  }
}))

import { Store } from '@xpert-ai/cloud/state'
import { CopilotServerService } from './copilot-server.service'
import { AiModelTypeEnum, AiProviderRole } from '../types'

describe('CopilotServerService', () => {
  let service: CopilotServerService
  let httpMock: HttpTestingController

  beforeEach(() => {
    organizationId$.next('org-1')
    storeMock.selectOrganizationId.mockClear()

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        CopilotServerService,
        {
          provide: Store,
          useValue: storeMock
        },
        {
          provide: NGXLogger,
          useValue: {
            error: jest.fn()
          }
        }
      ]
    })

    service = TestBed.inject(CopilotServerService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('should refetch copilot models when organization changes', () => {
    const org1Models = [
      {
        id: 'copilot-org-1',
        role: AiProviderRole.Primary,
        providerWithModels: {
          models: []
        }
      }
    ]
    const org2Models = [
      {
        id: 'copilot-org-2',
        role: AiProviderRole.Primary,
        providerWithModels: {
          models: []
        }
      }
    ]
    const emissions: unknown[] = []

    const subscription = service.getCopilotModels(AiModelTypeEnum.LLM).subscribe((models) => {
      emissions.push(models)
    })

    const firstRequest = httpMock.expectOne(
      (request) => request.url.endsWith('/copilot/models') && request.params.get('type') === AiModelTypeEnum.LLM
    )
    firstRequest.flush(org1Models)

    expect(emissions).toEqual([org1Models])

    organizationId$.next('org-2')

    const secondRequest = httpMock.expectOne(
      (request) => request.url.endsWith('/copilot/models') && request.params.get('type') === AiModelTypeEnum.LLM
    )
    secondRequest.flush(org2Models)

    expect(emissions).toEqual([org1Models, org2Models])

    subscription.unsubscribe()
  })
})
