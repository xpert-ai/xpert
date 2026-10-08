import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { AiWorkspaceFilesService } from './ai-workspace-files.service'

describe('AiWorkspaceFilesService', () => {
  let service: AiWorkspaceFilesService
  let http: HttpTestingController
  const root = 'http://localhost:3000/api/ai/assistants/a%2F1/workspace'
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] })
    service = TestBed.inject(AiWorkspaceFilesService)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())
  it('routes listing, reads, downloads and deletion through the AI entry point', () => {
    service.getWorkspaceFiles('a/1', 'folder').subscribe()
    service.getWorkspaceFile('a/1', 'folder/file.txt').subscribe()
    service.downloadWorkspaceFile('a/1', 'folder/file.txt').subscribe()
    service.deleteWorkspaceFile('a/1', 'folder/file.txt').subscribe()
    const requests = http.match(() => true)
    expect(requests.map(({ request }) => [request.method, request.url, request.params.get('path')])).toEqual([
      ['GET', `${root}/files`, 'folder'],
      ['GET', `${root}/file`, 'folder/file.txt'],
      ['GET', `${root}/file/download`, 'folder/file.txt'],
      ['DELETE', `${root}/file`, 'folder/file.txt']
    ])
    expect(requests[2].request.responseType).toBe('blob')
    for (const req of requests) req.flush(req.request.responseType === 'blob' ? new Blob(['bytes']) : {})
  })
  it('preserves text and multipart upload bodies', () => {
    service.saveWorkspaceFile('a/1', 'a.txt', 'hello').subscribe()
    const text = http.expectOne(`${root}/file`)
    expect(text.request.method).toBe('PUT')
    expect(text.request.body).toEqual({ path: 'a.txt', content: 'hello' })
    text.flush({})
    const blob = new Blob(['binary'])
    service.saveWorkspaceBinaryFile('a/1', 'folder/a.bin', blob).subscribe()
    service.uploadWorkspaceFileToFolder('a/1', new File(['text'], 'a.txt'), 'folder').subscribe()
    for (const suffix of ['save-binary', 'upload']) {
      const req = http.expectOne(`${root}/file/${suffix}`)
      expect(req.request.method).toBe('POST')
      expect(req.request.body).toBeInstanceOf(FormData)
      expect(req.request.body.get('path')).toBe(suffix === 'upload' ? 'folder' : 'folder/a.bin')
      expect(req.request.body.get('file')).toBeInstanceOf(Blob)
      req.flush({})
    }
  })
})
