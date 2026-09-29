jest.mock('./file-change-diff.component', () => {
  const { Component, Input, Output, EventEmitter } = jest.requireActual('@angular/core')
  @Component({ selector: 'xp-file-change-diff', standalone: true, template: '' })
  class FileChangeDiffComponent {
    @Input() report: unknown
    @Input() sideBySide: boolean
    @Input() wordWrap: boolean
    @Input() showWhitespace: boolean
    @Input() active: boolean
    @Output() stats = new EventEmitter()
  }
  return { FileChangeDiffComponent }
})
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import type { ChatFileChange, FileChangeReport } from '@xpert-ai/chatkit-types'
import { FileChangeReviewService, type FileChangeResource } from '../../../@core/services/file-change-review.service'
import { FileChangeReviewComponent } from './file-change-review.component'
import { createFileChangeReviewTab, hasReviewText, upsertFileChangeReviewTab } from './file-change-review.types'

const resource: FileChangeResource = {
  type: 'file_change',
  first: { artifactId: 'a', artifactVersionId: '1' },
  last: { artifactId: 'a', artifactVersionId: '1' }
}
const report: FileChangeReport = {
  schema: 'xpert.file-change.v1',
  workspacePath: 'a.ts',
  before: null,
  after: { size: 3, sha256: 'a'.repeat(64), text: 'new' }
}
const change: ChatFileChange = {
  id: 'a',
  title: 'a.ts',
  workspacePath: 'a.ts',
  coverage: 'observed',
  operation: 'added',
  before: null,
  after: report.after,
  resource
}

describe('review workbench', () => {
  const originalObserver = window.IntersectionObserver
  beforeAll(() =>
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    })
  )
  afterAll(() =>
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: originalObserver
    })
  )
  const service = { loadReport: jest.fn(), listChanges: jest.fn() }
  beforeEach(() => {
    service.loadReport.mockReset().mockResolvedValue(report)
    service.listChanges.mockReset().mockResolvedValue([change])
    TestBed.configureTestingModule({
      imports: [FileChangeReviewComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [{ provide: FileChangeReviewService, useValue: service }],
      errorOnUnknownElements: true,
      errorOnUnknownProperties: true,
      deferBlockBehavior: DeferBlockBehavior.Manual
    })
  })
  afterEach(() => TestBed.resetTestingModule())
  async function setup() {
    const fixture = TestBed.createComponent(FileChangeReviewComponent)
    fixture.componentRef.setInput('tab', createFileChangeReviewTab('thread', 'conversation', resource))
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }
  it('reuses the review tab for a thread while preserving unrelated tabs and pinned endpoints', () => {
    const old = createFileChangeReviewTab('thread', 'conversation', resource)
    const revised = createFileChangeReviewTab('thread', 'conversation', {
      ...resource,
      last: { artifactId: 'b', artifactVersionId: '2' }
    })
    const tabs = upsertFileChangeReviewTab([{ id: 'files', kind: 'files' }, old], revised)
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toEqual({ id: 'files', kind: 'files' })
    expect(tabs[1]).toMatchObject({ resource: revised.resource, revision: 1 })
    expect(old.resource).toEqual(resource)
    expect(
      upsertFileChangeReviewTab(tabs, createFileChangeReviewTab('another-thread', 'another-conversation', resource))
    ).toHaveLength(3)
  })
  it('opens all and only the fixed message ranges, with net counts before editors mount', async () => {
    const fixture = await setup()
    service.loadReport.mockClear()
    service.loadReport.mockImplementation(async (ref: FileChangeResource) => ({
      ...report,
      workspacePath: ref.first.artifactId === 'a' ? 'a.ts' : 'b.ts'
    }))
    const other = { ...resource, first: { artifactId: 'b', artifactVersionId: '2' } }
    fixture.componentRef.setInput(
      'tab',
      createFileChangeReviewTab('thread', 'conversation', {
        type: 'file_change_set',
        messageId: 'm',
        changes: [
          { workspacePath: 'a.ts', resource },
          { workspacePath: 'b.ts', resource: other }
        ]
      })
    )
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fixture.componentInstance.failed()).toBe(false)
    expect(fixture.componentInstance.entries().map((entry) => entry.path)).toEqual(['a.ts', 'b.ts'])
    expect(service.listChanges).not.toHaveBeenCalled()
    expect(service.loadReport.mock.calls.map(([ref]) => ref)).toEqual([resource, other])
    expect(fixture.componentInstance.totals()).toEqual({ added: 2, removed: 0 })
    expect(fixture.componentInstance.selectedLabel()).toBe('FileActivity.MessageChanges')
  })
  it('renders without a Dialog provider and binds the read-only snapshot', async () => {
    const fixture = await setup()
    expect(fixture.componentInstance.entries()[0].report).toEqual(report)
    expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull()
    const blocks = await fixture.getDeferBlocks()
    await blocks[0].render(DeferBlockState.Complete)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('xp-file-change-diff')).toBeTruthy()
    expect(hasReviewText({ ...report, after: { size: 8, sha256: 'b'.repeat(64) } })).toBe(false)
  })
  it('toggles display options and collapses/expands every loaded file', async () => {
    const fixture = await setup()
    const host: HTMLElement = fixture.nativeElement
    host.querySelector<HTMLButtonElement>('[aria-label="FileActivity.Unified"]')!.click()
    host.querySelector<HTMLButtonElement>('[aria-label="FileActivity.EnableWrap"]')!.click()
    host.querySelector<HTMLButtonElement>('[aria-label="FileActivity.CollapseAll"]')!.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.sideBySide()).toBe(false)
    expect(fixture.componentInstance.wordWrap()).toBe(true)
    expect(fixture.componentInstance.allCollapsed()).toBe(true)
    expect(host.querySelector('[data-review-file] [inert]')).toBeTruthy()
    host.querySelector<HTMLButtonElement>('[aria-label="FileActivity.ExpandAll"]')!.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.allCollapsed()).toBe(false)
  })
  it('retains unavailable legacy files alongside valid conversation snapshots', async () => {
    const fixture = await setup()
    service.listChanges.mockResolvedValue([
      change,
      { ...change, id: 'old', workspacePath: 'legacy.txt', resource: undefined, coverage: 'legacy' }
    ])
    fixture.componentInstance.selectScope('conversation')
    await fixture.whenStable()
    fixture.detectChanges()
    expect(service.listChanges).toHaveBeenCalledWith('conversation')
    expect(fixture.componentInstance.entries().map((entry) => [entry.path, !!entry.report])).toEqual([
      ['a.ts', true],
      ['legacy.txt', false]
    ])
  })
  it('does not replace a new selection with a late older load', async () => {
    const fixture = await setup()
    let resolveOld!: (value: FileChangeReport) => void
    service.loadReport.mockImplementationOnce(
      () =>
        new Promise<FileChangeReport>((resolve) => {
          resolveOld = resolve
        })
    )
    fixture.componentInstance.refresh()
    service.loadReport.mockResolvedValue({ ...report, workspacePath: 'b.ts' })
    fixture.componentRef.setInput('tab', {
      ...createFileChangeReviewTab('thread', 'conversation', resource),
      revision: 1
    })
    fixture.detectChanges()
    await fixture.whenStable()
    resolveOld(report)
    await Promise.resolve()
    await Promise.resolve()
    expect(fixture.componentInstance.entries()[0].path).toBe('b.ts')
  })
  it('shows recoverable summary errors and retries using the same scope', async () => {
    const fixture = await setup()
    service.listChanges.mockRejectedValueOnce(new Error('unavailable'))
    fixture.componentInstance.selectScope('conversation')
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.failed()).toBe(true)
    fixture.componentInstance.refresh()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.failed()).toBe(false)
    expect(fixture.componentInstance.entries()).toHaveLength(1)
  })
  it('does not display results after the tab is closed', async () => {
    const fixture = await setup()
    let resolve!: (value: FileChangeReport) => void
    service.loadReport.mockImplementationOnce(
      () =>
        new Promise<FileChangeReport>((done) => {
          resolve = done
        })
    )
    fixture.componentInstance.refresh()
    fixture.destroy()
    resolve(report)
    await Promise.resolve()
    await Promise.resolve()
    expect(fixture.componentInstance.entries()).toEqual([])
  })
})
