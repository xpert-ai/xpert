import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { KnowledgeFAQService } from './knowledge-faq.service'

describe('KnowledgeFAQService', () => {
  let service: KnowledgeFAQService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [KnowledgeFAQService]
    })
    service = TestBed.inject(KnowledgeFAQService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => httpMock.verify())

  it('loads FAQ entries with explicit search, enabled and paging parameters', () => {
    service.findAll('kb-1', { search: 'reset', enabled: false, skip: 20, take: 10 }).subscribe()

    const request = httpMock.expectOne((item) => item.url === '/api/knowledgebase/kb-1/faqs')
    expect(request.request.method).toBe('GET')
    expect(request.request.params.get('search')).toBe('reset')
    expect(request.request.params.get('enabled')).toBe('false')
    expect(request.request.params.get('skip')).toBe('20')
    expect(request.request.params.get('take')).toBe('10')
    request.flush({ items: [], total: 0 })
  })

  it('uses optimistic versions for update and delete operations', () => {
    service
      .update('kb-1', 'faq-1', {
        standardQuestion: 'Question',
        similarQuestions: [],
        negativeQuestions: ['Different question'],
        answerBlocks: ['Answer'],
        enabled: true,
        version: 4
      })
      .subscribe()
    const updateRequest = httpMock.expectOne('/api/knowledgebase/kb-1/faqs/faq-1')
    expect(updateRequest.request.method).toBe('PUT')
    expect(updateRequest.request.body.version).toBe(4)
    expect(updateRequest.request.body.negativeQuestions).toEqual(['Different question'])
    updateRequest.flush({ id: 'faq-1', version: 5 })

    service.delete('kb-1', 'faq-1', 5).subscribe()
    const deleteRequest = httpMock.expectOne(
      (item) => item.url === '/api/knowledgebase/kb-1/faqs/faq-1' && item.params.get('version') === '5'
    )
    expect(deleteRequest.request.method).toBe('DELETE')
    deleteRequest.flush({ success: true })
  })

  it('loads one FAQ for a citation deep link', () => {
    service.findOne('kb-1', 'faq-1').subscribe()

    const request = httpMock.expectOne('/api/knowledgebase/kb-1/faqs/faq-1')
    expect(request.request.method).toBe('GET')
    request.flush({ id: 'faq-1' })
  })

  it('previews and imports a WeKnora FAQ file as multipart form data', () => {
    const file = new File(['[]'], 'faq.json', { type: 'application/json' })

    service.previewImportFile('kb-1', file).subscribe()
    const previewRequest = httpMock.expectOne('/api/knowledgebase/kb-1/faqs/import/preview')
    expect(previewRequest.request.method).toBe('POST')
    expect(previewRequest.request.body).toBeInstanceOf(FormData)
    expect(previewRequest.request.body.get('file')).toBe(file)
    previewRequest.flush({ total: 1, items: [{ row: 1, standardQuestion: 'Question' }], truncated: false })

    service.importFile('kb-1', file, 'replace').subscribe()

    const request = httpMock.expectOne('/api/knowledgebase/kb-1/faqs/import')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBeInstanceOf(FormData)
    expect(request.request.body.get('file')).toBe(file)
    expect(request.request.body.get('mode')).toBe('replace')
    request.flush({ total: 0, imported: 0, failed: [] })
  })

  it('downloads a selected WeKnora-compatible FAQ export and the import template', () => {
    service.exportFile('kb-1', 'csv', ['faq-1', 'faq-2']).subscribe()

    const request = httpMock.expectOne(
      (item) => item.url === '/api/knowledgebase/kb-1/faqs/export' && item.params.get('format') === 'csv'
    )
    expect(request.request.method).toBe('GET')
    expect(request.request.responseType).toBe('blob')
    expect(request.request.params.get('ids')).toBe('faq-1,faq-2')
    request.flush(new Blob(['csv']))

    service.downloadImportTemplate('kb-1').subscribe()
    const templateRequest = httpMock.expectOne('/api/knowledgebase/kb-1/faqs/import-template')
    expect(templateRequest.request.method).toBe('GET')
    expect(templateRequest.request.responseType).toBe('blob')
    templateRequest.flush(new Blob(['template']))
  })
})
