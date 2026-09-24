import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { ArtifactService } from './artifact.service'
import { FileChangeReviewService, type FileChangeResource } from './file-change-review.service'

const revision = (text: string) => ({ sha256: 'a'.repeat(64), size: text.length, text })
const report = (path: string, before: string | null, after: string | null) => ({
  schema: 'xpert.file-change.v1',
  workspacePath: path,
  before: before === null ? null : revision(before),
  after: after === null ? null : revision(after)
})
const resource: FileChangeResource = {
  type: 'file_change',
  first: { artifactId: 'a', artifactVersionId: '1' },
  last: { artifactId: 'b', artifactVersionId: '2' }
}

describe('file change review snapshots', () => {
  let service: FileChangeReviewService
  let http: HttpTestingController
  const artifacts = { getFileChangeReport: jest.fn() }
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: ArtifactService, useValue: artifacts }]
    })
    service = TestBed.inject(FileChangeReviewService)
    http = TestBed.inject(HttpTestingController)
    artifacts.getFileChangeReport.mockReset()
  })
  afterEach(() => {
    http.verify()
    TestBed.resetTestingModule()
  })
  it('compares the pinned first-before and last-after, not current workspace bytes', async () => {
    artifacts.getFileChangeReport
      .mockReturnValueOnce(of(report('a.ts', 'old', 'middle')))
      .mockReturnValueOnce(of(report('a.ts', 'middle', 'new')))
    expect(await service.loadReport(resource)).toEqual(report('a.ts', 'old', 'new'))
    expect(artifacts.getFileChangeReport.mock.calls).toEqual([
      ['a', '1'],
      ['b', '2']
    ])
  })
  it('only requests a shared endpoint once', async () => {
    artifacts.getFileChangeReport.mockReturnValue(of(report('a.ts', null, 'new')))
    await service.loadReport({ ...resource, last: resource.first })
    expect(artifacts.getFileChangeReport).toHaveBeenCalledTimes(1)
  })
  it.each([report('other.ts', 'middle', 'new'), { schema: 'wrong' }])(
    'rejects mismatched or invalid snapshots',
    async (last) => {
      artifacts.getFileChangeReport
        .mockReturnValueOnce(of(report('a.ts', 'old', 'middle')))
        .mockReturnValueOnce(of(last))
      await expect(service.loadReport(resource)).rejects.toThrow()
    }
  )
  it('loads all summary pages and preserves legacy entries without fabricating snapshots', async () => {
    const promise = service.listChanges('conversation')
    const change = {
      id: 'a',
      title: 'a.ts',
      workspacePath: 'a.ts',
      operation: 'unknown',
      coverage: 'legacy',
      before: null,
      after: null
    }
    http
      .expectOne((request) => request.url.endsWith('/task-summary/fileChanges') && request.params.get('offset') === '0')
      .flush({ items: [change], total: 2 })
    await Promise.resolve()
    http
      .expectOne((request) => request.params.get('offset') === '1')
      .flush({ items: [{ ...change, id: 'b', workspacePath: 'b.ts' }], total: 2 })
    expect((await promise).map((item) => item.workspacePath)).toEqual(['a.ts', 'b.ts'])
  })
  it('fails instead of silently truncating an incomplete page', async () => {
    const promise = service.listChanges('conversation')
    const expectation = expect(promise).rejects.toThrow()
    http.expectOne((request) => request.url.endsWith('/task-summary/fileChanges')).flush({ items: [], total: 5 })
    await expectation
  })
})
