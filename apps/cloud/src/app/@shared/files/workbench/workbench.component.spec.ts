import { Dialog } from '@angular/cdk/dialog'
import { Component, EventEmitter, Input, Output } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { FileTreeNode } from '../tree/tree.utils'
import { FileEditorSelection } from '../editor/editor.component'
import { FileWorkbenchComponent } from './workbench.component'

type TFileDirectory = {
  filePath?: string
  fullPath?: string
  fileType?: string
  hasChildren?: boolean
  children?: TFileDirectory[] | null
  url?: string
}

type TFile = {
  filePath?: string
  fileType?: string
  contents?: string
  previewText?: string
  fileUrl?: string
  url?: string
  mimeType?: string
}

const mockToastr = {
  success: jest.fn(),
  danger: jest.fn(),
  warning: jest.fn()
}

jest.mock('../../../@core', () => ({
  getErrorMessage: (error: any) => error?.message ?? '',
  injectToastr: () => mockToastr
}))

jest.mock('@xpert-ai/ocap-angular/common', () => ({
  injectConfirmDelete: () => (_config: unknown, action: () => ReturnType<typeof of>) => action()
}))

var MockFileTreeComponent: any
jest.mock('../tree/tree.component', () => {
  @Component({
    standalone: true,
    selector: 'pac-file-tree',
    template: ''
  })
  class MockFileTreeComponentImpl {
    @Input() zSize?: 'sm' | 'default' | 'lg'
    @Input() title?: string
    @Input() subtitle?: string | null
    @Input() hasContext?: boolean
    @Input() items?: FileTreeNode[]
    @Input() activePath?: string | null
    @Input() loading?: boolean
    @Input() loadingPaths?: Set<string>
    @Input() canUpload?: boolean
    @Input() uploadDisabled?: boolean
    @Input() uploading?: boolean
    @Input() uploadTargetHint?: string | null
    @Input() canDownload?: boolean
    @Input() canDelete?: boolean
    @Input() downloadingPaths?: Set<string>
    @Input() deletingPaths?: Set<string>
    @Input() emptyTitle?: string
    @Input() emptyHint?: string
    @Input() selectTitle?: string
    @Input() selectHint?: string
    @Output() readonly fileSelect = new EventEmitter<FileTreeNode>()
    @Output() readonly directoryToggle = new EventEmitter<FileTreeNode>()
    @Output() readonly uploadRequest = new EventEmitter<'file' | 'folder'>()
    @Output() readonly fileDownload = new EventEmitter<FileTreeNode>()
    @Output() readonly fileDelete = new EventEmitter<FileTreeNode>()
  }

  MockFileTreeComponent = MockFileTreeComponentImpl
  return {
    FileTreeComponent: MockFileTreeComponentImpl
  }
})

var MockFileViewerComponent: any
jest.mock('../viewer/viewer.component', () => {
  @Component({
    standalone: true,
    selector: 'pac-file-viewer',
    template: ''
  })
  class MockFileViewerComponentImpl {
    @Input() file?: TFile | null
    @Input() filePath?: string | null
    @Input() content?: string
    @Input() loading?: boolean
    @Input() saving?: boolean
    @Input() readable?: boolean
    @Input() editable?: boolean
    @Input() markdown?: boolean
    @Input() dirty?: boolean
    @Input() downloadable?: boolean
    @Input() referenceable?: boolean
    @Input() previewUrl?: string | null
    @Input() mode?: 'view' | 'edit'
    @Input() readOnlyHint?: string
    @Input() unsupportedPreviewTitle?: string
    @Input() unsupportedPreviewHint?: string
    @Output() readonly modeChange = new EventEmitter<'view' | 'edit'>()
    @Output() readonly contentChange = new EventEmitter<string>()
    @Output() readonly discard = new EventEmitter<void>()
    @Output() readonly save = new EventEmitter<void>()
    @Output() readonly back = new EventEmitter<void>()
    @Output() readonly download = new EventEmitter<void>()
    @Output() readonly referenceFile = new EventEmitter<void>()
    @Output() readonly referenceSelection = new EventEmitter<FileEditorSelection>()
  }

  MockFileViewerComponent = MockFileViewerComponentImpl
  return {
    FileViewerComponent: MockFileViewerComponentImpl
  }
})

async function setup(options?: {
  rootFiles?: TFileDirectory[]
  nestedFiles?: Record<string, TFileDirectory[]>
  fileContents?: Record<string, TFile>
  referenceable?: boolean
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
      closed: of(true)
    }))
  }
  const toastr = {
    success: mockToastr.success,
    danger: mockToastr.danger,
    warning: mockToastr.warning
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
  const fileUploader = jest.fn((_file: File, path: string) =>
    of({
      filePath: [path, 'new.txt'].filter(Boolean).join('/'),
      fileType: 'txt',
      contents: 'uploaded\n'
    } as TFile)
  )
  const fileDeleter = jest.fn(() => of(undefined))

  TestBed.resetTestingModule()
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), FileWorkbenchComponent],
    providers: [
      {
        provide: Dialog,
        useValue: dialog
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(FileWorkbenchComponent)
  fixture.componentRef.setInput('rootId', 'skill-1')
  fixture.componentRef.setInput('rootLabel', 'Analyze New Repo')
  fixture.componentRef.setInput('filesLoader', filesLoader)
  fixture.componentRef.setInput('fileLoader', fileLoader)
  fixture.componentRef.setInput('fileSaver', fileSaver)
  fixture.componentRef.setInput('fileUploader', fileUploader)
  fixture.componentRef.setInput('fileDeleter', fileDeleter)
  fixture.componentRef.setInput('referenceable', options?.referenceable ?? false)
  fixture.detectChanges()
  await fixture.whenStable()
  await Promise.resolve()
  await Promise.resolve()
  fixture.detectChanges()

  return {
    fixture,
    component: fixture.componentInstance,
    filesLoader,
    fileLoader,
    fileSaver,
    fileUploader,
    fileDeleter,
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
    expect(docsNode).toBeDefined()
    if (!docsNode) {
      throw new Error('Expected docs node to be present')
    }

    await component.toggleDirectory(docsNode)

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

  it('uses root as the upload target until a tree item is selected', async () => {
    const { component } = await setup()

    expect(component.uploadTargetPath()).toBe('')
    expect(component.uploadTargetDisplayPath()).toBe('./')

    await component.openFile({
      filePath: 'SKILL.md',
      fullPath: 'SKILL.md',
      fileType: 'md',
      hasChildren: false
    } as FileTreeNode)

    expect(component.uploadTargetPath()).toBe('')

    await component.toggleDirectory({
      filePath: 'docs',
      fullPath: 'docs',
      fileType: 'directory',
      hasChildren: true,
      children: []
    } as FileTreeNode)

    expect(component.uploadTargetPath()).toBe('docs')
    expect(component.uploadTargetDisplayPath()).toBe('./docs')
  })

  it('highlights the selected directory in the tree', async () => {
    const { component } = await setup()

    expect(component.treeActivePath()).toBe('SKILL.md')

    await component.toggleDirectory({
      filePath: 'docs',
      fullPath: 'docs',
      fileType: 'directory',
      hasChildren: true,
      children: []
    } as FileTreeNode)

    expect(component.treeActivePath()).toBe('docs')
  })

  it('uploads folder contents with their relative parent directories preserved', async () => {
    const { component, fileUploader, toastr } = await setup()
    const directoryFile = new File(['# Guide\n'], 'guide.md', { type: 'text/markdown' })
    const nestedFile = new File(['console.log("hi")\n'], 'index.ts', { type: 'text/typescript' })
    Object.defineProperty(directoryFile, 'webkitRelativePath', {
      configurable: true,
      value: 'docs-import/guide.md'
    })
    Object.defineProperty(nestedFile, 'webkitRelativePath', {
      configurable: true,
      value: 'docs-import/src/index.ts'
    })

    const input = document.createElement('input')
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [directoryFile, nestedFile]
    })

    await component.toggleDirectory({
      filePath: 'docs',
      fullPath: 'docs',
      fileType: 'directory',
      hasChildren: true,
      children: []
    } as FileTreeNode)

    await component.onUploadFiles({ target: input } as Event, 'folder')

    expect(fileUploader).toHaveBeenNthCalledWith(1, directoryFile, 'docs/docs-import')
    expect(fileUploader).toHaveBeenNthCalledWith(2, nestedFile, 'docs/docs-import/src')
    expect(toastr.success).toHaveBeenCalled()
  })

  it('deletes a file and clears the active preview when it was selected', async () => {
    const { component, fileDeleter, toastr } = await setup({
      rootFiles: [
        {
          filePath: 'SKILL.md',
          fullPath: 'SKILL.md',
          fileType: 'md',
          hasChildren: false
        },
        {
          filePath: 'notes.txt',
          fullPath: 'notes.txt',
          fileType: 'txt',
          hasChildren: false
        }
      ],
      fileContents: {
        'SKILL.md': {
          filePath: 'SKILL.md',
          fileType: 'md',
          contents: '# Analyze New Repo\n'
        },
        'notes.txt': {
          filePath: 'notes.txt',
          fileType: 'txt',
          contents: 'hello\n'
        }
      }
    })

    await component.openFile({
      filePath: 'notes.txt',
      fullPath: 'notes.txt',
      fileType: 'txt',
      hasChildren: false
    } as FileTreeNode)

    await component.deleteTreeFile({
      filePath: 'notes.txt',
      fullPath: 'notes.txt',
      fileType: 'txt',
      hasChildren: false
    } as FileTreeNode)

    expect(fileDeleter).toHaveBeenCalledWith('notes.txt')
    expect(component.fileTree().some((item) => item.fullPath === 'notes.txt')).toBe(false)
    expect(component.activeFilePath()).toBe('SKILL.md')
    expect(toastr.success).toHaveBeenCalled()
  })

  it('emits a full-file reference using the current draft content', async () => {
    const { component, fixture } = await setup({ referenceable: true })
    const emitted: unknown[] = []
    component.referenceRequest.subscribe((value) => emitted.push(value))

    component.draftContent.set('# Updated skill\nWith unsaved changes\n')
    fixture.detectChanges()
    component.referenceActiveFile()

    expect(emitted).toEqual([
      {
        path: 'SKILL.md',
        text: '# Updated skill\nWith unsaved changes\n',
        startLine: 1,
        endLine: 3,
        language: 'markdown'
      }
    ])
  })

  it('emits a selected-range reference with relative path and language metadata', async () => {
    const { component } = await setup({
      referenceable: true,
      rootFiles: [
        {
          filePath: 'src/app.ts',
          fullPath: 'src/app.ts',
          fileType: 'ts',
          hasChildren: false
        }
      ],
      fileContents: {
        'src/app.ts': {
          filePath: 'src/app.ts',
          fileType: 'ts',
          contents: 'const x = 1\nconst y = 2\n'
        }
      }
    })
    const emitted: unknown[] = []
    component.referenceRequest.subscribe((value) => emitted.push(value))

    component.referenceSelectedRange({
      text: 'const y = 2',
      startLine: 2,
      endLine: 2
    })

    expect(emitted).toEqual([
      {
        path: 'src/app.ts',
        text: 'const y = 2',
        startLine: 2,
        endLine: 2,
        language: 'typescript'
      }
    ])
  })

  it('emits a selected-range reference for preview-text files even when the file is not directly editable', async () => {
    const { component } = await setup({
      referenceable: true,
      rootFiles: [
        {
          filePath: 'proposal.docx',
          fullPath: 'proposal.docx',
          fileType: 'docx',
          hasChildren: false
        }
      ],
      fileContents: {
        'proposal.docx': {
          filePath: 'proposal.docx',
          fileType: 'docx',
          previewText: 'Executive summary\n\nNext steps'
        }
      }
    })
    const emitted: unknown[] = []
    component.referenceRequest.subscribe((value) => emitted.push(value))

    component.referenceSelectedRange({
      text: 'Executive summary',
      startLine: 1,
      endLine: 1
    })

    expect(emitted).toEqual([
      {
        path: 'proposal.docx',
        text: 'Executive summary',
        startLine: 1,
        endLine: 1
      }
    ])
  })
})
