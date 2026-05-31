import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { NGXLogger } from 'ngx-logger'

jest.mock('@xpert-ai/cloud/state', () => ({
  API_PREFIX: '/api',
  toHttpParams: jest.fn()
}))

import { XpertTemplateService } from './xpert-template.service'

describe('XpertTemplateService', () => {
  let service: XpertTemplateService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        XpertTemplateService,
        {
          provide: NGXLogger,
          useValue: {
            error: jest.fn()
          }
        }
      ]
    })

    service = TestBed.inject(XpertTemplateService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('encodes plugin template ids before loading details', () => {
    const id = '@xpert-ai/plugin-bom-document-intake:bom-contract-intake-business-assistant'

    service.getTemplate(id).subscribe()

    const request = httpMock.expectOne(
      '/api/xpert-template/%40xpert-ai%2Fplugin-bom-document-intake%3Abom-contract-intake-business-assistant'
    )

    expect(request.request.method).toBe('GET')

    request.flush({
      id,
      name: 'bom-contract-intake-business-assistant',
      title: 'BOM Contract Intake',
      description: '',
      category: 'Plugin',
      copyright: null,
      export_data: '',
      avatar: {},
      type: 'agent'
    })
  })
})
