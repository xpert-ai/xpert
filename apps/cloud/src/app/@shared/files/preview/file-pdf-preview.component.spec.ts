import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { FilePdfPreviewComponent } from './file-pdf-preview.component'
import { loadPdfPreviewRuntime } from './pdf-preview-runtime'

jest.mock('./pdf-preview-runtime', () => ({ loadPdfPreviewRuntime: jest.fn() }))

describe('FilePdfPreviewComponent', () => {
  const render = jest.fn()
  const cleanup = jest.fn()
  const getPage = jest.fn()
  const destroy = jest.fn()
  const getDocument = jest.fn()
  const runtime = { getDocument } as unknown as Awaited<ReturnType<typeof loadPdfPreviewRuntime>>
  const originalResizeObserver = globalThis.ResizeObserver
  const scrollTo = jest.fn()

  beforeEach(async () => {
    jest.clearAllMocks()
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        observe() {}
        disconnect() {}
      }
    })
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(720)
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}) as CanvasRenderingContext2D)
    render.mockImplementation(() => ({ promise: Promise.resolve(), cancel: jest.fn() }))
    getPage.mockImplementation(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render,
      cleanup
    }))
    destroy.mockResolvedValue(undefined)
    getDocument.mockImplementation(() => ({ promise: Promise.resolve({ numPages: 2, getPage }), destroy }))
    jest.mocked(loadPdfPreviewRuntime).mockResolvedValue(runtime)
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), FilePdfPreviewComponent]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: originalResizeObserver })
  })

  async function settle(fixture: ReturnType<typeof TestBed.createComponent<FilePdfPreviewComponent>>) {
    fixture.detectChanges()
    await new Promise((resolve) => setTimeout(resolve, 0))
    fixture.detectChanges()
    await new Promise((resolve) => setTimeout(resolve, 0))
    fixture.detectChanges()
  }

  it('renders the PDF without a native iframe and supports page and zoom controls', async () => {
    const fixture = TestBed.createComponent(FilePdfPreviewComponent)
    fixture.componentRef.setInput('url', '/report.pdf')
    await settle(fixture)
    expect(getDocument).toHaveBeenCalledWith({ url: '/report.pdf', isEvalSupported: false })
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull()
    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull()
    expect(fixture.componentInstance.pageCount()).toBe(2)
    expect(getPage).toHaveBeenLastCalledWith(1)
    expect(render).toHaveBeenCalled()
    fixture.nativeElement.querySelector('[data-testid="pdf-next"]').click()
    await settle(fixture)
    expect(getPage).toHaveBeenLastCalledWith(2)
    expect(fixture.nativeElement.querySelector('[data-testid="pdf-next"]').disabled).toBe(true)
    const width = fixture.nativeElement.querySelector('canvas').width
    fixture.nativeElement.querySelector('[data-testid="pdf-zoom-in"]').click()
    await settle(fixture)
    expect(fixture.nativeElement.querySelector('canvas').width).toBeGreaterThan(width)
    fixture.destroy()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('shows a load error and retries the document instead of leaving a blank preview', async () => {
    getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('invalid PDF')), destroy }))
    const fixture = TestBed.createComponent(FilePdfPreviewComponent)
    fixture.componentRef.setInput('url', '/broken.pdf')
    await settle(fixture)
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()
    expect(fixture.componentInstance.loading()).toBe(false)
    fixture.componentInstance.retryCount.update((count) => count + 1)
    await settle(fixture)
    expect(fixture.componentInstance.failed()).toBe(false)
    expect(fixture.componentInstance.pageCount()).toBe(2)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('cancels old rendering when the source changes and ignores stale load results', async () => {
    let resolveOld: (value: { numPages: number; getPage: typeof getPage }) => void = () => undefined
    const old = new Promise((resolve) => {
      resolveOld = resolve
    })
    getDocument.mockImplementationOnce(() => ({ promise: old, destroy }))
    const fixture = TestBed.createComponent(FilePdfPreviewComponent)
    fixture.componentRef.setInput('url', '/old.pdf')
    fixture.detectChanges()
    await Promise.resolve()
    const cancel = jest.fn()
    render.mockImplementationOnce(() => ({ promise: new Promise(() => undefined), cancel }))
    fixture.componentRef.setInput('url', '/new.pdf')
    await settle(fixture)
    resolveOld({ numPages: 99, getPage })
    await settle(fixture)
    expect(fixture.componentInstance.pageCount()).toBe(2)
    fixture.componentInstance.changePage(1)
    await settle(fixture)
    expect(cancel).toHaveBeenCalled()
    expect(fixture.componentInstance.failed()).toBe(false)
  })
})
