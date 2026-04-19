import { Component, Input, Pipe, PipeTransform } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { DomSanitizer } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { ChatCanvasFilePreviewContentComponent } from './file-preview-content.component'

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

describe('ChatCanvasFilePreviewContentComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatCanvasFilePreviewContentComponent]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders an image preview', () => {
    const fixture = TestBed.createComponent(ChatCanvasFilePreviewContentComponent)
    fixture.componentRef.setInput('fileName', 'diagram.png')
    fixture.componentRef.setInput('previewKind', 'image')
    fixture.componentRef.setInput('url', '/assets/diagram.png')
    fixture.detectChanges()

    const image = fixture.nativeElement.querySelector('img')
    expect(image?.getAttribute('src')).toBe('/assets/diagram.png')
  })

  it('renders a pdf iframe preview', () => {
    const fixture = TestBed.createComponent(ChatCanvasFilePreviewContentComponent)
    fixture.componentRef.setInput('fileName', 'guide.pdf')
    fixture.componentRef.setInput('previewKind', 'pdf')
    fixture.componentRef.setInput('url', '/assets/guide.pdf')
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('iframe')).toBeTruthy()
  })

  it('renders native audio and video previews', () => {
    const audioFixture = TestBed.createComponent(ChatCanvasFilePreviewContentComponent)
    audioFixture.componentRef.setInput('fileName', 'voice.mp3')
    audioFixture.componentRef.setInput('previewKind', 'audio')
    audioFixture.componentRef.setInput('url', '/assets/voice.mp3')
    audioFixture.detectChanges()

    expect(audioFixture.nativeElement.querySelector('audio[controls]')).toBeTruthy()

    const videoFixture = TestBed.createComponent(ChatCanvasFilePreviewContentComponent)
    videoFixture.componentRef.setInput('fileName', 'demo.mp4')
    videoFixture.componentRef.setInput('previewKind', 'video')
    videoFixture.componentRef.setInput('url', '/assets/demo.mp4')
    videoFixture.detectChanges()

    expect(videoFixture.nativeElement.querySelector('video[controls]')).toBeTruthy()
  })

  it('renders spreadsheet tabs and switches active sheets', () => {
    const fixture = TestBed.createComponent(ChatCanvasFilePreviewContentComponent)
    fixture.componentRef.setInput('fileName', 'report.xlsx')
    fixture.componentRef.setInput('previewKind', 'spreadsheet')
    fixture.componentRef.setInput('spreadsheet', {
      rowLimit: 200,
      sheets: [
        {
          columns: [{ name: 'Amount' }],
          name: 'Summary',
          rows: Array.from({ length: 200 }, (_, index) => ({ Amount: index + 1 })),
          totalRows: 250
        },
        {
          columns: [{ name: 'City' }],
          name: 'Cities',
          rows: [{ City: 'Shanghai' }, { City: 'Beijing' }],
          totalRows: 2
        }
      ]
    })
    fixture.detectChanges()

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')).map((button: HTMLButtonElement) =>
      button.textContent?.trim()
    )
    expect(buttons).toEqual(expect.arrayContaining(['Summary', 'Cities']))

    const table = fixture.nativeElement.querySelector('.mock-table')
    expect(table?.getAttribute('data-rows')).toBe('200')

    ;(fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement).click()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.mock-table')?.getAttribute('data-rows')).toBe('2')
  })

  it('renders a single-sheet csv preview without sheet tabs', () => {
    const fixture = TestBed.createComponent(ChatCanvasFilePreviewContentComponent)
    fixture.componentRef.setInput('fileName', 'report.csv')
    fixture.componentRef.setInput('previewKind', 'spreadsheet')
    fixture.componentRef.setInput('spreadsheet', {
      rowLimit: 200,
      sheets: [
        {
          columns: [{ name: 'Amount' }],
          name: 'report',
          rows: [{ Amount: 42 }],
          totalRows: 1
        }
      ]
    })
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0)
    expect(fixture.nativeElement.querySelector('.mock-table')?.getAttribute('data-rows')).toBe('1')
  })

  it('shows the unsupported fallback state', () => {
    const fixture = TestBed.createComponent(ChatCanvasFilePreviewContentComponent)
    fixture.componentRef.setInput('downloadable', true)
    fixture.componentRef.setInput('fileName', 'slides.pptx')
    fixture.componentRef.setInput('previewKind', 'unsupported')
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.FormatCannotPreviewed')
  })
})
