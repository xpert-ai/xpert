import { PipeTransform } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By, DomSanitizer } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { FileEditorSelection } from '../editor/editor.component'
import { FilePreviewContentComponent } from './file-preview-content.component'

jest.mock('@xpert-ai/ocap-angular/common', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'ngm-spin',
    template: '<div class="mock-spin"></div>'
  })
  class NgmSpinComponent {}

  @Component({
    standalone: true,
    selector: 'ngm-table',
    template:
      '<div class="mock-table" [attr.data-rows]="data?.length ?? 0" [attr.data-columns]="columns?.length ?? 0"></div>'
  })
  class NgmTableComponent {
    @Input() columns: unknown[] | null = null
    @Input() data: unknown[] | null = null
  }

  return {
    NgmSpinComponent,
    NgmTableComponent
  }
})

jest.mock('ngx-markdown', () => {
  const { Component, Input, NgModule } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'markdown',
    template: '<div class="mock-markdown">{{ data }}</div>'
  })
  class MarkdownComponent {
    @Input() data?: string
    @Input() start?: number
    @Input() lineNumbers?: boolean
    @Input() clipboard?: boolean
  }

  @NgModule({
    imports: [MarkdownComponent],
    exports: [MarkdownComponent]
  })
  class MarkdownModule {}

  return {
    MarkdownModule,
    MarkdownComponent
  }
})

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

jest.mock('./file-html-preview.component', () => {
  const { Component, Input, Output, EventEmitter } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-file-html-preview',
    template: '<div data-html-preview="true"></div>'
  })
  class FileHtmlPreviewComponent {
    @Input() content?: string | null
    @Input() filePath?: string | null
    @Input() fileName?: string
    @Input() inspectMode?: boolean
    @Input() loading?: boolean
    @Input() referenceable?: boolean
    @Input() url?: string | null
    @Output() fileElementReference = new EventEmitter()
    @Output() inspectModeChange = new EventEmitter<boolean>()
  }

  return {
    FileHtmlPreviewComponent
  }
})

describe('FilePreviewContentComponent', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), FilePreviewContentComponent]
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

  it('renders extracted document previews', () => {
    const fixture = TestBed.createComponent(FilePreviewContentComponent)
    fixture.componentRef.setInput('fileName', 'proposal.docx')
    fixture.componentRef.setInput('previewKind', 'document')
    fixture.componentRef.setInput('documentHtml', '<h1>Executive summary</h1><p>Next steps</p>')
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('Executive summary')
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Executive summary')
  })

  it('renders html previews through the dedicated html preview component and forwards events', () => {
    const fixture = TestBed.createComponent(FilePreviewContentComponent)
    const elementReferences: unknown[] = []
    const inspectModes: boolean[] = []
    fixture.componentInstance.fileElementReference.subscribe((value) => elementReferences.push(value))
    fixture.componentInstance.htmlInspectModeChange.subscribe((value) => inspectModes.push(value))
    fixture.componentRef.setInput('filePath', 'src/index.html')
    fixture.componentRef.setInput('fileName', 'index.html')
    fixture.componentRef.setInput('previewKind', 'html')
    fixture.componentRef.setInput('referenceable', true)
    fixture.componentRef.setInput('htmlInspectMode', true)
    fixture.componentRef.setInput('content', '<html><body><button id="hero">Launch</button></body></html>')
    fixture.detectChanges()

    const htmlPreview = fixture.debugElement.query(By.css('pac-file-html-preview'))
    expect(htmlPreview).not.toBeNull()
    expect(htmlPreview.componentInstance.content).toBe('<html><body><button id="hero">Launch</button></body></html>')
    expect(htmlPreview.componentInstance.filePath).toBe('src/index.html')
    expect(htmlPreview.componentInstance.fileName).toBe('index.html')
    expect(htmlPreview.componentInstance.inspectMode).toBe(true)
    expect(htmlPreview.componentInstance.referenceable).toBe(true)

    const reference = {
      type: 'file_element',
      attributes: [{ name: 'id', value: 'hero' }],
      domPath: 'html > body > button',
      filePath: 'src/index.html',
      outerHtml: '<button id="hero">Launch</button>',
      selector: '#hero',
      tagName: 'button',
      text: 'Launch'
    }
    htmlPreview.componentInstance.fileElementReference.emit(reference)
    htmlPreview.componentInstance.inspectModeChange.emit(false)

    expect(elementReferences).toEqual([reference])
    expect(inspectModes).toEqual([false])
  })

  it('emits selection references from rich document previews', () => {
    const fixture = TestBed.createComponent(FilePreviewContentComponent)
    const emitted: FileEditorSelection[] = []
    fixture.componentInstance.referenceSelection.subscribe((value) => emitted.push(value))
    fixture.componentRef.setInput('fileName', 'proposal.docx')
    fixture.componentRef.setInput('previewKind', 'document')
    fixture.componentRef.setInput('referenceable', true)
    fixture.componentRef.setInput('content', 'Executive summary\n\nNext steps')
    fixture.componentRef.setInput('documentHtml', '<h1>Executive summary</h1><p>Next steps</p>')
    fixture.detectChanges()

    const host = fixture.nativeElement.querySelector('[data-file-preview-document-host="true"]') as HTMLElement
    const body = fixture.nativeElement.querySelector('[data-file-preview-document-body="true"]') as HTMLElement
    const heading = body.querySelector('h1') as HTMLElement
    const selectionText = heading.firstChild as Text

    jest.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 480))
    Object.defineProperty(host, 'clientWidth', {
      configurable: true,
      value: 800
    })
    Object.defineProperty(host, 'scrollLeft', {
      configurable: true,
      value: 0
    })
    Object.defineProperty(host, 'scrollTop', {
      configurable: true,
      value: 0
    })

    const getSelectionSpy = jest.spyOn(document, 'getSelection').mockReturnValue({
      anchorNode: selectionText,
      focusNode: selectionText,
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges: jest.fn(),
      toString: () => 'Executive summary',
      getRangeAt: () => ({
        getBoundingClientRect: () => new DOMRect(120, 96, 160, 24)
      })
    } as Selection)

    document.dispatchEvent(new Event('selectionchange'))
    fixture.detectChanges()

    const button = fixture.nativeElement.querySelector(
      '[data-reference-button="preview-selection"]'
    ) as HTMLButtonElement | null
    expect(button).not.toBeNull()

    button?.click()

    expect(emitted).toEqual([
      {
        text: 'Executive summary',
        startLine: 1,
        endLine: 1
      }
    ])

    getSelectionSpy.mockRestore()
  })

  it('falls back to extracted document text when rich preview html is unavailable', () => {
    const fixture = TestBed.createComponent(FilePreviewContentComponent)
    fixture.componentRef.setInput('fileName', 'proposal.docx')
    fixture.componentRef.setInput('previewKind', 'document')
    fixture.componentRef.setInput('content', 'Executive summary\n\nNext steps')
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('Executive summary')
    expect(fixture.nativeElement.querySelector('h1')).toBeNull()
  })

  it('renders extracted presentation previews', () => {
    const fixture = TestBed.createComponent(FilePreviewContentComponent)
    fixture.componentRef.setInput('fileName', 'deck.pptx')
    fixture.componentRef.setInput('previewKind', 'presentation')
    fixture.componentRef.setInput('content', 'Agenda\nQuarterly results')
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('Quarterly results')
    expect(fixture.nativeElement.textContent).toContain('deck.pptx')
  })

  it('renders spreadsheet previews', () => {
    const fixture = TestBed.createComponent(FilePreviewContentComponent)
    fixture.componentRef.setInput('fileName', 'report.xlsx')
    fixture.componentRef.setInput('previewKind', 'spreadsheet')
    fixture.componentRef.setInput('spreadsheet', {
      rowLimit: 200,
      sheets: [
        {
          columns: [{ name: 'Amount' }],
          name: 'Summary',
          rows: [{ Amount: 42 }],
          totalRows: 1
        }
      ]
    })
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.mock-table')?.getAttribute('data-rows')).toBe('1')
    expect(fixture.nativeElement.textContent).toContain('Previewing the first 200 rows per sheet.')
  })
})
