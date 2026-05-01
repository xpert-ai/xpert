import { provideHttpClient } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { FileViewerComponent, inferMarkdownPreviewSelection } from './viewer.component'

jest.mock('@xpert-ai/ocap-angular/common', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'ngm-spin',
    template: ''
  })
  class NgmSpinComponent {}

  return {
    NgmSpinComponent
  }
})

jest.mock('@xpert-ai/headless-ui', () => {
  const { Component, Directive, EventEmitter, forwardRef, Input, Output } = jest.requireActual('@angular/core')
  const { NG_VALUE_ACCESSOR } = jest.requireActual('@angular/forms')

  @Directive({
    standalone: true,
    selector: '[zTooltip]'
  })
  class ZardTooltipDirective {
    @Input() zTooltip?: unknown
    @Input() zPosition?: string
  }

  @Component({
    standalone: true,
    selector: 'z-segmented',
    template: '<ng-content />',
    providers: [
      {
        provide: NG_VALUE_ACCESSOR,
        useExisting: forwardRef(() => ZardSegmentedComponent),
        multi: true
      }
    ]
  })
  class ZardSegmentedComponent {
    @Input() ngModel?: unknown
    @Output() ngModelChange = new EventEmitter()
    private onChange: (value: unknown) => void = () => undefined
    private onTouched: () => void = () => undefined

    writeValue(value: unknown) {
      this.ngModel = value
    }

    registerOnChange(onChange: (value: unknown) => void) {
      this.onChange = onChange
    }

    registerOnTouched(onTouched: () => void) {
      this.onTouched = onTouched
    }
  }

  @Component({
    standalone: true,
    selector: 'z-segmented-item',
    template: ''
  })
  class ZardSegmentedItemComponent {
    @Input() value?: unknown
    @Input() label?: string
    @Input() zDisabled?: boolean
  }

  return {
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    ZardTooltipImports: [ZardTooltipDirective]
  }
})

jest.mock('ngx-markdown', () => {
  const { Component, Input, NgModule } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'markdown',
    template: ''
  })
  class MarkdownComponent {
    @Input() data?: string
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

jest.mock('../editor/editor.component', () => {
  const { Component, Input, Output, EventEmitter } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-file-editor',
    template: ''
  })
  class FileEditorComponent {
    @Input() editable?: boolean
    @Input() lineNumbers?: boolean
    @Input() wordWrap?: boolean
    @Input() fileName?: string
    @Input() content?: string
    @Input() referenceable?: boolean
    @Output() contentChange = new EventEmitter()
    @Output() referenceSelection = new EventEmitter()
    @Output() selectionChange = new EventEmitter()
  }

  return {
    FileEditorComponent
  }
})

jest.mock('../preview/file-preview-content.component', () => {
  const { Component, Input, Output, EventEmitter } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-file-preview-content',
    template: ''
  })
  class FilePreviewContentComponent {
    @Input() previewKind?: unknown
    @Input() content?: string | null
    @Input() documentHtml?: string | null
    @Input() downloadable?: boolean
    @Input() error?: string | null
    @Input() filePath?: string | null
    @Input() fileName?: string
    @Input() loading?: boolean
    @Input() referenceable?: boolean
    @Input() spreadsheet?: unknown
    @Input() url?: string | null
    @Input() htmlInspectMode?: boolean
    @Output() download = new EventEmitter<void>()
    @Output() fileElementReference = new EventEmitter()
    @Output() htmlInspectModeChange = new EventEmitter<boolean>()
    @Output() referenceSelection = new EventEmitter()
  }

  return {
    FilePreviewContentComponent
  }
})

describe('FileViewerComponent', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), FileViewerComponent],
      providers: [provideHttpClient()]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('emits file references for readable files and enables selection references after switching to code mode', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'src/app.ts')
    fixture.componentRef.setInput('content', 'const x = 1\nconst y = 2\n')
    fixture.componentRef.setInput('readable', true)
    fixture.componentRef.setInput('referenceable', true)
    fixture.detectChanges()

    const component = fixture.componentInstance
    const fileReferences: number[] = []
    component.referenceFile.subscribe(() => fileReferences.push(1))
    component.updatePreviewMode('code')

    expect(component.canReferenceFile()).toBe(true)
    expect(component.editorReferenceable()).toBe(true)

    component.emitFileReference()

    expect(fileReferences).toEqual([1])
  })

  it('emits file references for non-readable files without enabling selection references', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'screenshots/home.png')
    fixture.componentRef.setInput('readable', false)
    fixture.componentRef.setInput('referenceable', true)
    fixture.detectChanges()

    const component = fixture.componentInstance
    const fileReferences: number[] = []
    component.referenceFile.subscribe(() => fileReferences.push(1))

    expect(component.canReferenceFile()).toBe(true)
    expect(component.editorReferenceable()).toBe(false)

    component.emitFileReference()

    expect(fileReferences).toEqual([1])
  })

  it('emits sidebar toggle clicks and updates the desktop toggle icon', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('sideMenuToggleVisible', true)
    fixture.componentRef.setInput('sideMenuVisible', true)
    fixture.detectChanges()

    const toggles: number[] = []
    fixture.componentInstance.sideMenuToggle.subscribe(() => toggles.push(1))

    const button = fixture.debugElement.query(By.css('[data-sidebar-toggle-button="viewer"]'))
    expect(button).not.toBeNull()
    expect(button.nativeElement.querySelector('i')?.classList.contains('ri-sidebar-fold-line')).toBe(true)

    ;(button.nativeElement as HTMLButtonElement).click()
    expect(toggles).toEqual([1])

    fixture.componentRef.setInput('sideMenuVisible', false)
    fixture.detectChanges()

    expect(button.nativeElement.querySelector('i')?.classList.contains('ri-sidebar-unfold-line')).toBe(true)
  })

  it('emits refresh requests from the header control', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'README.md')
    fixture.detectChanges()

    const refreshes: number[] = []
    fixture.componentInstance.refresh.subscribe(() => refreshes.push(1))

    const button = fixture.debugElement.query(By.css('[data-refresh-button="viewer"]'))
    expect(button).not.toBeNull()

    ;(button.nativeElement as HTMLButtonElement).click()
    expect(refreshes).toEqual([1])
  })

  it('disables the inline selection action in markdown preview while keeping full-file references', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'README.md')
    fixture.componentRef.setInput('content', '# Title\n')
    fixture.componentRef.setInput('readable', true)
    fixture.componentRef.setInput('referenceable', true)
    fixture.componentRef.setInput('markdown', true)
    fixture.detectChanges()

    const component = fixture.componentInstance

    expect(component.canReferenceFile()).toBe(true)
    expect(component.editorReferenceable()).toBe(false)
  })

  it('uses the enhanced preview path for html files in view mode', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'index.html')
    fixture.componentRef.setInput('content', '<!doctype html><html><body>Preview</body></html>')
    fixture.componentRef.setInput('readable', true)
    fixture.detectChanges()

    const component = fixture.componentInstance

    expect(component.previewKind()).toBe('html')
    expect(component.canTogglePreview()).toBe(true)
    expect(component.showEnhancedPreview()).toBe(true)
    expect(component.htmlPreviewReferenceable()).toBe(false)

    component.updatePreviewMode('code')

    expect(component.isPreviewMode()).toBe(false)
  })

  it('enables html element references only for readable html preview mode', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'index.html')
    fixture.componentRef.setInput('content', '<!doctype html><html><body>Preview</body></html>')
    fixture.componentRef.setInput('readable', true)
    fixture.componentRef.setInput('referenceable', true)
    fixture.detectChanges()

    const component = fixture.componentInstance
    expect(component.htmlPreviewReferenceable()).toBe(true)
    expect(component.previewContentReferenceable()).toBe(true)

    component.updatePreviewMode('code')

    expect(component.htmlPreviewReferenceable()).toBe(false)
  })

  it('shows the html inspect button in preview mode and passes inspect mode to preview content', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'index.html')
    fixture.componentRef.setInput('content', '<!doctype html><html><body><button>Preview</button></body></html>')
    fixture.componentRef.setInput('readable', true)
    fixture.componentRef.setInput('referenceable', true)
    fixture.detectChanges()

    const component = fixture.componentInstance
    const button = fixture.debugElement.query(By.css('[data-html-inspect-button="viewer"]'))
    const preview = fixture.debugElement.query(By.css('pac-file-preview-content'))
    expect(component.canInspectHtmlPreview()).toBe(true)
    expect(button).not.toBeNull()
    expect(preview.componentInstance.htmlInspectMode).toBe(false)

    ;(button.nativeElement as HTMLButtonElement).click()
    fixture.detectChanges()

    expect(component.htmlInspectMode()).toBe(true)
    expect((button.nativeElement as HTMLButtonElement).className).toContain('btn-primary')
    expect(preview.componentInstance.htmlInspectMode).toBe(true)

    preview.componentInstance.htmlInspectModeChange.emit(false)
    fixture.detectChanges()

    expect(component.htmlInspectMode()).toBe(false)

    component.toggleHtmlInspectMode()
    expect(component.htmlInspectMode()).toBe(true)

    fixture.componentRef.setInput('filePath', 'other.html')
    fixture.detectChanges()

    expect(component.htmlInspectMode()).toBe(false)

    component.toggleHtmlInspectMode()
    expect(component.htmlInspectMode()).toBe(true)

    component.updatePreviewMode('code')
    fixture.detectChanges()

    expect(component.htmlInspectMode()).toBe(false)
    expect(fixture.debugElement.query(By.css('[data-html-inspect-button="viewer"]'))).toBeNull()
  })

  it('enables the inline selection action for markdown files after switching to edit mode', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'README.md')
    fixture.componentRef.setInput('content', '# Title\n')
    fixture.componentRef.setInput('readable', true)
    fixture.componentRef.setInput('editable', true)
    fixture.componentRef.setInput('referenceable', true)
    fixture.componentRef.setInput('markdown', true)
    fixture.componentRef.setInput('mode', 'edit')
    fixture.detectChanges()

    expect(fixture.componentInstance.editorReferenceable()).toBe(true)
  })

  it('enables preview selection references for document previews with extracted text', () => {
    const fixture = TestBed.createComponent(FileViewerComponent)
    fixture.componentRef.setInput('filePath', 'proposal.docx')
    fixture.componentRef.setInput('referenceable', true)
    fixture.componentRef.setInput('file', {
      filePath: 'proposal.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      previewText: 'Executive summary\n\nNext steps'
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.documentPreviewReferenceable()).toBe(true)
  })

  it('infers markdown preview line ranges from rendered heading text', () => {
    expect(inferMarkdownPreviewSelection('# Title\n\nParagraph text\n', 'Title')).toEqual({
      text: 'Title',
      startLine: 1,
      endLine: 1
    })
  })

  it('falls back to the first and last matching lines for multi-line preview selections', () => {
    expect(
      inferMarkdownPreviewSelection(
        '# Title\n\n- First item\n- Second item\n\nParagraph text\n',
        'First item\nSecond item'
      )
    ).toEqual({
      text: 'First item\nSecond item',
      startLine: 3,
      endLine: 4
    })
  })
})
