import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { TemplateInstallationService } from './template-installation.service'

describe('Durable template installation transport', () => {
  let service: TemplateInstallationService
  let http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] })
    service = TestBed.inject(TemplateInstallationService)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())
  it('starts the fixed installation intent and resolves immediately from a 202 receipt', async () => {
    const input = {
      templateId: '@plugin/template',
      workspaceId: 'workspace',
      idempotencyKey: 'same-key',
      publish: true
    }
    const response = service.create(input)
    const request = http.expectOne((r) => r.url.endsWith('/xpert-template-installations'))
    expect(request.request.body).toEqual(input)
    request.flush({ id: 'operation', status: 'running' }, { status: 202, statusText: 'Accepted' })
    await expect(response).resolves.toEqual({ id: 'operation', status: 'running' })
  })
  it('retries the stored operation without resending editable input', async () => {
    const response = service.retry('operation')
    const request = http.expectOne((r) => r.url.endsWith('/operation/retry'))
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual({})
    request.flush({ id: 'operation' })
    await response
  })
  it('reads history with explicit workspace scope and pagination', async () => {
    const response = service.list('workspace', 20)
    const request = http.expectOne((r) => r.url.endsWith('/xpert-template-installations'))
    expect(request.request.params.get('workspaceId')).toBe('workspace')
    expect(request.request.params.get('skip')).toBe('20')
    expect(request.request.params.get('take')).toBe('20')
    request.flush({ items: [], total: 0 })
    await response
  })
  it('surfaces lost connection errors so the saved intent can be replayed', async () => {
    const response = service.get('operation')
    const assertion = expect(response).rejects.toMatchObject({ status: 503 })
    http.expectOne((r) => r.url.endsWith('/operation')).flush({}, { status: 503, statusText: 'Unavailable' })
    await assertion
  })
})
