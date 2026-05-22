import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { FileTreeComponent } from './tree.component'

jest.mock('@xpert-ai/headless-ui', () => {
  const { Component, Directive, Input } = jest.requireActual('@angular/core')

  @Directive({
    standalone: true,
    selector: '[z-button]'
  })
  class ZardButtonComponent {
    @Input() zSize?: string
    @Input() zType?: string
  }

  @Component({
    standalone: true,
    selector: 'z-loader',
    template: ''
  })
  class ZardLoaderComponent {
    @Input() zSize?: string
  }

  @Directive({
    standalone: true,
    selector: '[zTooltip]'
  })
  class ZardTooltipDirective {
    @Input() zTooltip?: unknown
    @Input() zPosition?: string
  }

  return {
    cx: (...classes: Array<string | null | undefined | false>) => classes.filter(Boolean).join(' '),
    mergeClasses: (...classes: Array<string | null | undefined | false>) => classes.filter(Boolean).join(' '),
    ZardButtonComponent,
    ZardLoaderComponent,
    ZardTooltipImports: [ZardTooltipDirective]
  }
})

describe('FileTreeComponent', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), FileTreeComponent]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('sets the full path as the tooltip title for folder and file rows', () => {
    const fixture = TestBed.createComponent(FileTreeComponent)
    fixture.componentRef.setInput('hasContext', true)
    fixture.componentRef.setInput('items', [
      {
        filePath: 'docs',
        fullPath: 'workspace/docs',
        fileType: 'directory',
        hasChildren: true,
        expanded: false,
        children: null
      },
      {
        filePath: 'README.md',
        fullPath: 'workspace/README.md',
        fileType: 'md',
        hasChildren: false
      }
    ])
    fixture.detectChanges()

    const rows = Array.from(fixture.nativeElement.querySelectorAll<HTMLElement>('[data-file-tree-item-content]'))

    expect(rows.map((row) => row.getAttribute('title'))).toEqual(['workspace/docs', 'workspace/README.md'])
  })

  it('hides download actions for folders unless directory downloads are enabled', () => {
    const fixture = TestBed.createComponent(FileTreeComponent)
    fixture.componentRef.setInput('hasContext', true)
    fixture.componentRef.setInput('canDownload', true)
    fixture.componentRef.setInput('items', [
      {
        filePath: 'docs',
        fullPath: 'workspace/docs',
        fileType: 'directory',
        hasChildren: true,
        expanded: false,
        children: null
      }
    ])
    fixture.detectChanges()

    expect(
      fixture.nativeElement.querySelector<HTMLButtonElement>('button[aria-label="PAC.Files.Download"]')
    ).toBeNull()
  })

  it('shows download actions for folders when directory downloads are enabled', () => {
    const fixture = TestBed.createComponent(FileTreeComponent)
    const downloadSpy = jest.fn()
    fixture.componentRef.setInput('hasContext', true)
    fixture.componentRef.setInput('canDownload', true)
    fixture.componentRef.setInput('canDownloadDirectory', true)
    fixture.componentRef.setInput('items', [
      {
        filePath: 'docs',
        fullPath: 'workspace/docs',
        fileType: 'directory',
        hasChildren: true,
        expanded: false,
        children: null
      }
    ])
    fixture.componentInstance.fileDownload.subscribe(downloadSpy)
    fixture.detectChanges()

    const downloadButton = fixture.nativeElement.querySelector<HTMLButtonElement>(
      'button[aria-label="PAC.Files.Download"]'
    )
    downloadButton?.click()

    expect(downloadButton).not.toBeNull()
    expect(downloadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'docs',
        fullPath: 'workspace/docs',
        hasChildren: true
      })
    )
  })
})
