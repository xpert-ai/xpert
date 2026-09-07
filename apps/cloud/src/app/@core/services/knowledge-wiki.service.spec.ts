import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { KnowledgeWikiService } from './knowledge-wiki.service'

describe('KnowledgeWikiService', () => {
  let service: KnowledgeWikiService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [KnowledgeWikiService] })
    service = TestBed.inject(KnowledgeWikiService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => httpMock.verify())

  it('loads status, filtered pages and a page through knowledgebase-scoped routes', () => {
    service.getStatus('kb-1').subscribe()
    const status = httpMock.expectOne('/api/knowledgebase/kb-1/wiki/status')
    expect(status.request.method).toBe('GET')
    status.flush({
      canManage: false,
      enabled: true,
      status: 'ready',
      availability: 'ready',
      readyPageCount: 1,
      requiresManagement: false
    })

    service.getPages('kb-1', { search: 'xpert', pageType: 'entity', skip: 0, take: 20 }).subscribe()
    const pages = httpMock.expectOne((request) => request.url === '/api/knowledgebase/kb-1/wiki/pages')
    expect(pages.request.params.get('search')).toBe('xpert')
    expect(pages.request.params.get('pageType')).toBe('entity')
    expect(pages.request.params.get('take')).toBe('20')
    pages.flush({ items: [], total: 0 })

    service.getPage('kb-1', 'page-1').subscribe()
    const page = httpMock.expectOne('/api/knowledgebase/kb-1/wiki/pages/page-1')
    expect(page.request.method).toBe('GET')
    page.flush({ id: 'page-1' })
  })

  it('sends explicit charge confirmation for rebuild and indeterminate retry', () => {
    service
      .rebuild('kb-1', { confirmModelCharges: true, maxModelInvocations: 40, maxEstimatedTokens: 400000 })
      .subscribe()
    const rebuild = httpMock.expectOne('/api/knowledgebase/kb-1/wiki/rebuild')
    expect(rebuild.request.method).toBe('POST')
    expect(rebuild.request.body).toEqual({
      confirmModelCharges: true,
      maxModelInvocations: 40,
      maxEstimatedTokens: 400000
    })
    rebuild.flush({ id: 'job-1' })

    service.retryJob('kb-1', 'job-1', true).subscribe()
    const retry = httpMock.expectOne('/api/knowledgebase/kb-1/wiki/jobs/job-1/retry')
    expect(retry.request.method).toBe('POST')
    expect(retry.request.body).toEqual({ confirmAdditionalModelCharge: true })
    retry.flush({ id: 'job-1' })
  })

  it('reads document status with one scoped batch request', () => {
    const response = { indexedDocumentIds: ['document-1'] }
    const next = jest.fn()
    service.getDocumentStatus('kb-1', ['document-1', 'document-2']).subscribe(next)
    const request = httpMock.expectOne(
      '/api/knowledgebase/kb-1/wiki/documents/status?documentIds=document-1,document-2'
    )
    expect(request.request.method).toBe('GET')
    request.flush(response)
    expect(next).toHaveBeenCalledWith(response)
  })
})
