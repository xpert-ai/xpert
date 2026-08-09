import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { Store } from '@cloud/app/@core/state'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { NGXLogger } from 'ngx-logger'
import { of } from 'rxjs'
import { KnowledgeDocumentService } from './knowledge-document.service'

describe('KnowledgeDocumentService analysis preview', () => {
  let service: KnowledgeDocumentService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        KnowledgeDocumentService,
        {
          provide: Store,
          useValue: {
            token: 'test-token',
            user: { tenantId: 'tenant-1' },
            activeScope: { level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' },
            selectOrganizationId: jest.fn(() => of('org-1'))
          }
        },
        { provide: NGXLogger, useValue: { debug: jest.fn() } }
      ]
    })
    service = TestBed.inject(KnowledgeDocumentService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => httpMock?.verify())

  it('loads only the requested analysis page', () => {
    service.getAnalysisPreviewPage('doc-1', 660).subscribe((page) => expect(page.page).toBe(660))

    const request = httpMock.expectOne('/api/knowledge-document/doc-1/analysis-preview/pages/660')
    expect(request.request.method).toBe('GET')
    request.flush({ schemaVersion: 1, page: 660, width: 1000, height: 1400, markdown: 'Page 660', blocks: [] })
    httpMock.expectNone('/api/knowledge-document/doc-1/analysis-preview/pages/659')
    httpMock.expectNone('/api/knowledge-document/doc-1/analysis-preview/pages/661')
  })

  it('builds an authenticated PDF.js Range source', () => {
    expect(service.originalFilePreviewSource('doc-1')).toEqual({
      url: '/api/knowledge-document/doc-1/original-file/preview',
      httpHeaders: {
        Authorization: 'Bearer test-token',
        'Tenant-Id': 'tenant-1',
        'X-Scope-Level': RequestScopeLevel.ORGANIZATION,
        'Organization-Id': 'org-1'
      },
      withCredentials: true
    })
  })
})
