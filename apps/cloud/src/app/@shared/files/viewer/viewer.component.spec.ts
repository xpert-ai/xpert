import { TestBed } from '@angular/core/testing'
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
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'z-segmented',
    template: '<ng-content />'
  })
  class ZardSegmentedComponent {
    @Input() ngModel?: unknown
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
    ZardSegmentedItemComponent
  }
})

jest.mock('ngx-markdown', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'markdown',
    template: ''
  })
  class MarkdownComponent {
    @Input() data?: string
  }

  return {
    MarkdownModule: class MarkdownModule {},
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
    @Output() contentChange = new EventEmitter()
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
    @Input() fileName?: string
    @Input() loading?: boolean
    @Input() referenceable?: boolean
    @Input() spreadsheet?: unknown
    @Input() url?: string | null
    @Output() download = new EventEmitter<void>()
    @Output() referenceSelection = new EventEmitter()
  }

  return {
    FilePreviewContentComponent
  }
})

describe('FileViewerComponent', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule()
    TestBed.overrideComponent(FileViewerComponent, {
      set: {
        template: '',
        imports: []
      }
    })
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), FileViewerComponent]
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

    component.updatePreviewMode('code')

    expect(component.isPreviewMode()).toBe(false)
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
