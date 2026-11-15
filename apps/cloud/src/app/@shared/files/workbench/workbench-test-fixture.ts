import { Dialog } from '@angular/cdk/dialog'
import { Component, EventEmitter, Input, Output } from '@angular/core'
import { By } from '@angular/platform-browser'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { FileTreeNode } from '../tree/tree.utils'
import { FileEditorSelection } from '../editor/editor.component'
import { FileWorkbenchComponent } from './workbench.component'

export type TFileDirectory = {
  filePath?: string
  fullPath?: string
  fileType?: string
  mimeType?: string
  hasChildren?: boolean
  children?: TFileDirectory[] | null
  url?: string
  createdAt?: Date | string
  updatedAt?: Date | string
}

export type TFile = {
  filePath?: string
  fileType?: string
  contents?: string
  previewText?: string
  fileUrl?: string
  url?: string
  mimeType?: string
  createdAt?: Date | string
  updatedAt?: Date | string
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

jest.mock('@xpert-ai/headless-ui', () => {
  const { Directive, Input } = jest.requireActual('@angular/core')

  @Directive({
    standalone: true,
    selector: '[z-button]'
  })
  class ZardButtonComponent {
    @Input() zType?: string
    @Input() zSize?: string
    @Input() zDisabled?: boolean
    @Input() zLoading?: boolean
  }

  return {
    injectConfirmDelete: () => (_config: unknown, action: () => ReturnType<typeof of>) => action(),
    ZardButtonComponent,
    XpDialogFrameImports: jest.requireActual('@xpert-ai/headless-ui').XpDialogFrameImports
  }
})

export var MockFileTreeComponent: any
jest.mock('../tree/tree.component', () => {
  @Component({
    standalone: true,
    selector: 'xp-file-tree',
    template: ''
  })
  class MockFileTreeComponentImpl {
    @Input() zSize?: 'sm' | 'default' | 'lg'
    @Input() surface?: 'card' | 'plain'
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
    @Input() canDownloadDirectory?: boolean
    @Input() canDelete?: boolean
    @Input() showRefresh?: boolean
    @Input() downloadingPaths?: Set<string>
    @Input() deletingPaths?: Set<string>
    @Input() emptyTitle?: string
    @Input() emptyHint?: string
    @Input() selectTitle?: string
    @Input() selectHint?: string
    @Output() readonly fileSelect = new EventEmitter<FileTreeNode>()
    @Output() readonly directoryToggle = new EventEmitter<FileTreeNode>()
    @Output() readonly uploadRequest = new EventEmitter<'file' | 'folder'>()
    @Output() readonly refreshRequest = new EventEmitter<void>()
    @Output() readonly fileDownload = new EventEmitter<FileTreeNode>()
    @Output() readonly fileDelete = new EventEmitter<FileTreeNode>()
  }

  MockFileTreeComponent = MockFileTreeComponentImpl
  return {
    FileTreeComponent: MockFileTreeComponentImpl
  }
})

export var MockFileViewerComponent: any
jest.mock('../viewer/viewer.component', () => {
  @Component({
    standalone: true,
    selector: 'xp-file-viewer',
    template: ''
  })
  class MockFileViewerComponentImpl {
    @Input() surface?: 'card' | 'plain'
    @Input() file?: TFile | null
    @Input() filePath?: string | null
    @Input() content?: string
    @Input() loading?: boolean
    @Input() saving?: boolean
    @Input() readable?: boolean
    @Input() editable?: boolean
    @Input() markdown?: boolean
    @Input() docx?: boolean
    @Input() pptx?: boolean
    @Input() documentBuffer?: ArrayBuffer | null
    @Input() spreadsheet?: boolean
    @Input() dirty?: boolean
    @Input() downloadable?: boolean
    @Input() referenceable?: boolean
    @Input() previewUrl?: string | null
    @Input() sideMenuToggleVisible?: boolean
    @Input() sideMenuVisible?: boolean
    @Input() backVisible?: boolean
    @Input() mode?: 'view' | 'edit'
    @Input() readOnlyHint?: string
    @Input() unsupportedPreviewTitle?: string
    @Input() unsupportedPreviewHint?: string
    @Output() readonly modeChange = new EventEmitter<'view' | 'edit'>()
    @Output() readonly contentChange = new EventEmitter<string>()
    @Output() readonly documentDirtyChange = new EventEmitter<boolean>()
    @Output() readonly documentSave = new EventEmitter<File>()
    @Output() readonly documentError = new EventEmitter<Error>()
    @Output() readonly spreadsheetDirtyChange = new EventEmitter<boolean>()
    @Output() readonly pptxDirtyChange = new EventEmitter<boolean>()
    @Output() readonly pptxError = new EventEmitter<Error>()
    @Output() readonly discard = new EventEmitter<void>()
    @Output() readonly save = new EventEmitter<void>()
    @Output() readonly refresh = new EventEmitter<void>()
    @Output() readonly back = new EventEmitter<void>()
    @Output() readonly download = new EventEmitter<void>()
    @Output() readonly referenceFile = new EventEmitter<void>()
    @Output() readonly referenceElement = new EventEmitter()
    @Output() readonly referenceSelection = new EventEmitter<FileEditorSelection>()
    @Output() readonly sideMenuToggle = new EventEmitter<void>()

    finishEditing() {
      return Promise.resolve()
    }

    exportSpreadsheetFile() {
      return Promise.resolve(
        new File(['updated workbook'], this.filePath?.split('/').pop() || 'workbook.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
      )
    }

    reloadSpreadsheet() {
      return Promise.resolve()
    }

    markSpreadsheetSaved() {
      return undefined
    }

    exportDocxFile() {
      const file = new File(['updated document'], this.filePath?.split('/').pop() || 'document.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
      Object.defineProperty(file, 'arrayBuffer', {
        configurable: true,
        value: () => Promise.resolve(new ArrayBuffer(16))
      })
      return Promise.resolve(file)
    }

    reloadDocx() {
      return undefined
    }

    exportPptxFile() {
      return Promise.resolve(
        new File(['updated presentation'], this.filePath?.split('/').pop() || 'presentation.pptx', {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        })
      )
    }

    reloadPptx() {
      return undefined
    }

    markPptxSaved() {
      return undefined
    }
  }

  MockFileViewerComponent = MockFileViewerComponentImpl
  return {
    FileViewerComponent: MockFileViewerComponentImpl
  }
})

export async function setup(options?: {
  rootFiles?: TFileDirectory[]
  nestedFiles?: Record<string, TFileDirectory[]>
  fileContents?: Record<string, TFile>
  fileDownloader?: jest.Mock
  binaryFileSaver?: jest.Mock
  referenceable?: boolean
}) {
  const rootFiles = options?.rootFiles ?? [
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
  const filesLoader = jest.fn((path?: string) => of(path ? (nestedFiles[path] ?? []) : rootFiles))
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
  const fileDownloader = options?.fileDownloader
  const binaryFileSaver = options?.binaryFileSaver

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
  if (fileDownloader) {
    fixture.componentRef.setInput('fileDownloader', fileDownloader)
  }
  if (binaryFileSaver) {
    fixture.componentRef.setInput('binaryFileSaver', binaryFileSaver)
  }
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
    binaryFileSaver,
    toastr
  }
}
