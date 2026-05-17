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
})
