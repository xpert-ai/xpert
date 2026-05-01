import { PipeTransform } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { DomSanitizer } from '@angular/platform-browser'
import { FileHtmlPreviewComponent } from './file-html-preview.component'

jest.mock('@xpert-ai/core', () => {
  const { Pipe, inject } = jest.requireActual('@angular/core')

  @Pipe({
    standalone: true,
    name: 'safe'
  })
  class SafePipe implements PipeTransform {
    readonly #sanitizer = inject(DomSanitizer)

    transform(value: string, type?: string) {
      if (type === 'resourceUrl') {
        return this.#sanitizer.bypassSecurityTrustResourceUrl(value)
      }

      return value
    }
  }

  return {
    SafePipe
  }
})

describe('FileHtmlPreviewComponent', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileHtmlPreviewComponent]
    }).compileComponents()
  })

  afterEach(() => {
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL
      })
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL')
    }

    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL
      })
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }

    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders html previews through blob urls so webpage effects load in the iframe', () => {
    const previewUrls = ['blob:html-preview-1', 'blob:html-preview-2']
    const createObjectURL = jest.fn(() => previewUrls.shift() ?? 'blob:html-preview-fallback')
    const revokeObjectURL = jest.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL
    })

    const fixture = TestBed.createComponent(FileHtmlPreviewComponent)
    fixture.componentRef.setInput(
      'content',
      '<!doctype html><html><body><script>document.body.dataset.ready = "true"</script></body></html>'
    )
    fixture.detectChanges()

    const host: HTMLElement = fixture.nativeElement
    const iframe = host.querySelector<HTMLIFrameElement>('iframe')
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(iframe?.getAttribute('src')).toBe('blob:html-preview-1')
    expect(iframe?.hasAttribute('srcdoc')).toBe(false)
    expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts')

    fixture.componentRef.setInput('content', '<!doctype html><html><body>Updated</body></html>')
    fixture.detectChanges()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:html-preview-1')
    expect(host.querySelector<HTMLIFrameElement>('iframe')?.getAttribute('src')).toBe('blob:html-preview-2')

    fixture.destroy()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:html-preview-2')
  })

  it('syncs inspect mode to the preview frame', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:html-preview-inspect')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn()
    })

    const fixture = TestBed.createComponent(FileHtmlPreviewComponent)
    fixture.componentRef.setInput('filePath', 'index.html')
    fixture.componentRef.setInput('referenceable', true)
    fixture.componentRef.setInput('inspectMode', true)
    fixture.componentRef.setInput('content', '<!doctype html><html><body><button>Launch</button></body></html>')
    fixture.detectChanges()

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const frameWindow = iframe.contentWindow as Window
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined)

    fixture.componentInstance.handleHtmlPreviewLoad()

    expect(postMessage).toHaveBeenCalledWith(
      {
        enabled: true,
        token: fixture.componentInstance.htmlInspectorToken(),
        type: 'xpert-html-inspector-mode'
      },
      '*'
    )
  })

  it('emits file element references from valid html inspector messages and exits inspect mode', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:html-preview-reference')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn()
    })

    const fixture = TestBed.createComponent(FileHtmlPreviewComponent)
    const emitted: unknown[] = []
    const inspectModes: boolean[] = []
    fixture.componentInstance.fileElementReference.subscribe((value) => emitted.push(value))
    fixture.componentInstance.inspectModeChange.subscribe((value) => inspectModes.push(value))
    fixture.componentRef.setInput('filePath', 'src/index.html')
    fixture.componentRef.setInput('fileName', 'index.html')
    fixture.componentRef.setInput('referenceable', true)
    fixture.componentRef.setInput(
      'content',
      '<!doctype html>\n<html><body>\n<button id="hero">Launch</button>\n</body></html>'
    )
    fixture.detectChanges()

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const token = fixture.componentInstance.htmlInspectorToken()

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'xpert-html-inspector-element',
          token,
          element: {
            attributes: [{ name: 'id', value: 'hero' }],
            documentTitle: 'Preview',
            domPath: 'html > body > button',
            label: 'button "Launch"',
            outerHtml: '<button id="hero">Launch</button>',
            selector: '#hero',
            tagName: 'button',
            text: 'Launch'
          }
        },
        source: iframe.contentWindow
      })
    )

    expect(emitted).toEqual([
      {
        type: 'file_element',
        attributes: [{ name: 'id', value: 'hero' }],
        documentTitle: 'Preview',
        domPath: 'html > body > button',
        filePath: 'src/index.html',
        label: 'button "Launch"',
        outerHtml: '<button id="hero">Launch</button>',
        selector: '#hero',
        sourceEndLine: 3,
        sourceStartLine: 3,
        tagName: 'button',
        text: 'Launch'
      }
    ])
    expect(inspectModes).toEqual([false])
  })

  it('ignores html inspector messages with the wrong token or source frame', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:html-preview-ignored')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn()
    })

    const fixture = TestBed.createComponent(FileHtmlPreviewComponent)
    const emitted: unknown[] = []
    const inspectModes: boolean[] = []
    fixture.componentInstance.fileElementReference.subscribe((value) => emitted.push(value))
    fixture.componentInstance.inspectModeChange.subscribe((value) => inspectModes.push(value))
    fixture.componentRef.setInput('filePath', 'src/index.html')
    fixture.componentRef.setInput('referenceable', true)
    fixture.componentRef.setInput('content', '<html><body><button id="hero">Launch</button></body></html>')
    fixture.detectChanges()

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const token = fixture.componentInstance.htmlInspectorToken()
    const element = {
      attributes: [{ name: 'id', value: 'hero' }],
      domPath: 'html > body > button',
      outerHtml: '<button id="hero">Launch</button>',
      selector: '#hero',
      tagName: 'button',
      text: 'Launch'
    }

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'xpert-html-inspector-element',
          token: 'wrong-token',
          element
        },
        source: iframe.contentWindow
      })
    )

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'xpert-html-inspector-element',
          token,
          element
        },
        source: window
      })
    )

    expect(emitted).toEqual([])
    expect(inspectModes).toEqual([])
  })
})
