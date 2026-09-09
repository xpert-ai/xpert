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
    @Input() zDisabled?: boolean
  }

  @Component({
    standalone: true,
    selector: 'z-loader',
    template: ''
  })
  class ZardLoaderComponent {
    @Input() zSize?: string
  }

  @Component({
    standalone: true,
    selector: 'z-icon'
  })
  class ZardIconComponent {
    @Input() zType?: string
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

  @Directive({
    standalone: true,
    selector: '[z-menu]'
  })
  class ZardMenuDirective {
    @Input() zMenuTriggerFor?: unknown
    @Input() zMenuTriggerData?: unknown
    @Input() zPlacement?: string
  }

  @Directive({
    standalone: true,
    selector: '[z-menu-content]'
  })
  class ZardMenuContentDirective {}

  @Directive({
    standalone: true,
    selector: '[z-menu-item]'
  })
  class ZardMenuItemDirective {
    @Input() zDisabled?: boolean
    @Input() zType?: string
  }

  return {
    cx: (...classes: Array<string | null | undefined | false>) => classes.filter(Boolean).join(' '),
    mergeClasses: (...classes: Array<string | null | undefined | false>) => classes.filter(Boolean).join(' '),
    ZardButtonComponent,
    ZardIconComponent,
    ZardLoaderComponent,
    ZardMenuImports: [ZardMenuDirective, ZardMenuContentDirective, ZardMenuItemDirective],
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
    expect(rows.every((row) => !row.hasAttribute('zTooltip'))).toBe(true)
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

    expect(fixture.nativeElement.querySelector<HTMLButtonElement>('button[aria-label="XP.Files.Download"]')).toBeNull()
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

    const menuTrigger = fixture.nativeElement.querySelector<HTMLButtonElement>('button[z-menu]')

    expect(menuTrigger).not.toBeNull()
    expect(fixture.componentInstance.canDownloadItem(fixture.componentRef.instance.items()[0])).toBe(true)

    const item = fixture.componentRef.instance.items()[0]
    fixture.componentInstance.onFileDownload(new MouseEvent('click'), item)
    expect(downloadSpy).toHaveBeenCalledWith(item)
  })

  it('uses one more-actions trigger for row download and delete operations', () => {
    const fixture = TestBed.createComponent(FileTreeComponent)
    fixture.componentRef.setInput('hasContext', true)
    fixture.componentRef.setInput('canDownload', true)
    fixture.componentRef.setInput('canDelete', true)
    fixture.componentRef.setInput('items', [
      {
        filePath: 'README.md',
        fullPath: 'workspace/README.md',
        fileType: 'md',
        hasChildren: false
      }
    ])
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('button[z-menu]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('button[aria-label="XP.Files.Download"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('button[aria-label="XP.Files.Delete"]')).toBeNull()
  })

  it('emits refresh requests when the refresh control is enabled', () => {
    const fixture = TestBed.createComponent(FileTreeComponent)
    const refreshSpy = jest.fn()
    fixture.componentRef.setInput('showRefresh', true)
    fixture.componentInstance.refreshRequest.subscribe(refreshSpy)
    fixture.detectChanges()

    fixture.componentInstance.onRefreshClick()

    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })

  it('maps folders and common file extensions to platform icon names', () => {
    const fixture = TestBed.createComponent(FileTreeComponent)
    const component = fixture.componentInstance

    expect(component.itemIconType({ filePath: 'docs', hasChildren: true, expanded: false } as FileTreeNode)).toBe(
      'folder'
    )
    expect(component.itemIconType({ filePath: 'docs', hasChildren: true, expanded: true } as FileTreeNode)).toBe(
      'folder-open'
    )
    expect(component.itemIconType({ filePath: 'README.md', hasChildren: false } as FileTreeNode)).toBe('book-open-text')
    expect(component.itemIconType({ filePath: 'table.xlsx', hasChildren: false } as FileTreeNode)).toBe('table_view')
    expect(component.itemIconType({ filePath: 'unknown.bin', hasChildren: false } as FileTreeNode)).toBe('file')
  })
})
