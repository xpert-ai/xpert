import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { NGXLogger } from 'ngx-logger'
import { XpertTemplateService } from './xpert-template.service'

describe('Xpert template catalog requests', () => {
  let service: XpertTemplateService
  let http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: NGXLogger, useValue: {} }]
    })
    service = TestBed.inject(XpertTemplateService)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it('encodes plugin template ids before loading details', () => {
    const id = '@xpert-ai/plugin-bom-document-intake:bom-contract-intake-business-assistant'
    service.getTemplate(id).subscribe()
    const request = http.expectOne((item) =>
      item.url.endsWith(
        '/xpert-template/%40xpert-ai%2Fplugin-bom-document-intake%3Abom-contract-intake-business-assistant'
      )
    )
    expect(request.request.method).toBe('GET')
    expect(request.request.params.has('locale')).toBe(false)
    request.flush({ id })
  })

  it('sends named query parameters and resolves the explicitly selected language', () => {
    service.getCatalog({ search: 'frontend', offset: 24, limit: 24 }).subscribe()
    const catalog = http.expectOne((request) => request.url.endsWith('/xpert-template/catalog'))
    expect(catalog.request.params.get('search')).toBe('frontend')
    expect(catalog.request.params.get('offset')).toBe('24')
    expect(catalog.request.params.has('data')).toBe(false)
    catalog.flush({ items: [], total: 0, offset: 24, limit: 24, categories: [] })
    service.getTemplate('@xpert-ai/agency:frontend', 'zh-Hans').subscribe()
    const detail = http.expectOne((request) => request.url.endsWith(encodeURIComponent('@xpert-ai/agency:frontend')))
    expect(detail.request.params.get('locale')).toBe('zh-Hans')
    detail.flush({})
  })

  it('reads all summary pages without silently truncating the role library', () => {
    const next = jest.fn()
    service.getSummaries().subscribe(next)
    const first = http.expectOne((request) => request.url.endsWith('/catalog'))
    first.flush({ items: [{ id: 'first' }], total: 2, offset: 0, limit: 1, categories: [] })
    const second = http.expectOne((request) => request.url.endsWith('/catalog'))
    expect(second.request.params.get('offset')).toBe('1')
    second.flush({ items: [{ id: 'second' }], total: 2, offset: 1, limit: 1, categories: [] })
    expect(next).toHaveBeenCalledWith([{ id: 'first' }, { id: 'second' }])
  })
})
