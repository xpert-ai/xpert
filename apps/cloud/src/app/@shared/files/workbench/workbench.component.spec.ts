import { Dialog } from '@angular/cdk/dialog'
import { Component, EventEmitter, Input, Output } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ToastrService, TFile, TFileDirectory } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { FileTreeComponent } from '../tree/tree.component'
import { FileTreeNode } from '../tree/tree.utils'
import { FileViewerComponent } from '../viewer/viewer.component'
import { FileWorkbenchComponent } from './workbench.component'

@Component({
  standalone: true,
  selector: 'pac-file-tree',
  template: ''
})
class MockFileTreeComponent {
  @Input() zSize?: 'sm' | 'default' | 'lg'
  @Input() title?: string
  @Input() subtitle?: string | null
  @Input() hasContext?: boolean
  @Input() items?: FileTreeNode[]
  @Input() activePath?: string | null
  @Input() loading?: boolean
  @Input() loadingPaths?: Set<string>
  @Input() emptyTitle?: string
  @Input() emptyHint?: string
  @Input() selectTitle?: string
  @Input() selectHint?: string
  @Output() readonly fileSelect = new EventEmitter<FileTreeNode>()
  @Output() readonly directoryToggle = new EventEmitter<FileTreeNode>()
}

@Component({
  standalone: true,
  selector: 'pac-file-viewer',
  template: ''
})
class MockFileViewerComponent {
  @Input() filePath?: string | null
  @Input() content?: string
  @Input() loading?: boolean
  @Input() saving?: boolean
  @Input() readable?: boolean
  @Input() editable?: boolean
  @Input() markdown?: boolean
  @Input() dirty?: boolean
  @Input() mode?: 'view' | 'edit'
  @Input() readOnlyHint?: string
  @Output() readonly modeChange = new EventEmitter<'view' | 'edit'>()
  @Output() readonly contentChange = new EventEmitter<string>()
  @Output() readonly discard = new EventEmitter<void>()
  @Output() readonly save = new EventEmitter<void>()
  @Output() readonly back = new EventEmitter<void>()
}

async function setup(options?: {
  rootFiles?: TFileDirectory[]
  nestedFiles?: Record<string, TFileDirectory[]>
  fileContents?: Record<string, TFile>
}) {
  const rootFiles =
    options?.rootFiles ??
    [
      {
        filePath: 'SKILL.md',
        fullPath: 'SKILL.md',
        fileType: 'md',
        hasChildren: false
      },
      {
        filePath: 'docs',
        fullPath: 'docs',
        fileType: 'directory',
        hasChildren: true,
        children: null
      }
    ]
  const nestedFiles = options?.nestedFiles ?? {
    docs: [
      {
        filePath: 'guide.md',
        fullPath: 'docs/guide.md',
        fileType: 'md',
        hasChildren: false
      }
    ]
  }
  const fileContents = options?.fileContents ?? {
    'SKILL.md': {
      filePath: 'SKILL.md',
      fileType: 'md',
      contents: '# Analyze New Repo\n'
    },
    'docs/guide.md': {
      filePath: 'docs/guide.md',
      fileType: 'md',
      contents: '# Guide\n'
    }
  }

  const dialog = {
    open: jest.fn(() => ({
      close: jest.fn(),
      closed: of(null)
    }))
  }
  const toastr = {
    success: jest.fn(),
    danger: jest.fn()
  }
  const filesLoader = jest.fn((path?: string) => of(path ? nestedFiles[path] ?? [] : rootFiles))
  const fileLoader = jest.fn((path: string) => of(fileContents[path]))
  const fileSaver = jest.fn((path: string, content: string) =>
    of({
      filePath: path,
      fileType: 'md',
      contents: content
    } as TFile)
  )

  TestBed.resetTestingModule()
  TestBed.overrideComponent(FileWorkbenchComponent, {
    remove: {
      imports: [FileTreeComponent, FileViewerComponent]
    },
    add: {
      imports: [MockFileTreeComponent, MockFileViewerComponent]
    }
  })
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), FileWorkbenchComponent],
    providers: [
      {
        provide: Dialog,
        useValue: dialog
      },
      {
        provide: ToastrService,
        useValue: toastr
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(FileWorkbenchComponent)
  fixture.componentRef.setInput('rootId', 'skill-1')
  fixture.componentRef.setInput('rootLabel', 'Analyze New Repo')
  fixture.componentRef.setInput('filesLoader', filesLoader)
  fixture.componentRef.setInput('fileLoader', fileLoader)
  fixture.componentRef.setInput('fileSaver', fileSaver)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return {
    fixture,
    component: fixture.componentInstance,
    filesLoader,
    fileLoader,
    fileSaver,
    toastr
  }
}

describe('FileWorkbenchComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads the root tree and defaults to SKILL.md', async () => {
    const { component, filesLoader, fileLoader } = await setup()

    expect(filesLoader).toHaveBeenCalledWith()
    expect(fileLoader).toHaveBeenCalledWith('SKILL.md')
    expect(component.activeFilePath()).toBe('SKILL.md')
    expect(component.draftContent()).toContain('Analyze New Repo')
  })

  it('lazy loads nested folders when expanding the tree', async () => {
    const { component, filesLoader } = await setup()

    const docsNode = component.fileTree().find((item) => item.fullPath === 'docs')
    await component.toggleDirectory(docsNode!)

    expect(filesLoader).toHaveBeenCalledWith('docs')
    expect((component.fileTree().find((item) => item.fullPath === 'docs')?.children as FileTreeNode[])?.[0]?.fullPath).toBe(
      'docs/guide.md'
    )
  })

  it('supports markdown edit and save', async () => {
    const { component, fileSaver, toastr } = await setup()

    await component.switchPanelMode('edit')
    component.draftContent.set('# Updated skill\n')

    expect(component.dirty()).toBe(true)

    await component.saveActiveFile()

    expect(fileSaver).toHaveBeenCalledWith('SKILL.md', '# Updated skill\n')
    expect(component.dirty()).toBe(false)
    expect(component.panelMode()).toBe('view')
    expect(component.activeFile()?.contents).toBe('# Updated skill\n')
    expect(toastr.success).toHaveBeenCalled()
  })
})
