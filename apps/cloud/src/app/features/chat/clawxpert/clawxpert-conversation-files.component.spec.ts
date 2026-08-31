import { Component, EventEmitter, Input, Output } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ChatConversationService, XpertAPIService } from '../../../@core'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'

type FileWorkbenchReferenceRequest = {
  path: string
  text: string
  startLine: number
  endLine: number
  language?: string
}

var MockFileWorkbenchComponent: any
jest.mock('../../../@core', () => ({
  ChatConversationService: class ChatConversationService {},
  XpertAPIService: class XpertAPIService {}
}))

jest.mock('../../../@shared/files', () => {
  @Component({
    standalone: true,
    selector: 'xp-file-workbench',
    template: ''
  })
  class MockFileWorkbenchComponentImpl {
    @Input() rootId?: string | null
    @Input() rootLabel?: string | null
    @Input() filesLoader?: unknown
    @Input() fileLoader?: unknown
    @Input() fileSaver?: unknown
    @Input() fileDeleter?: unknown
    @Input() fileUploader?: unknown
    @Input() fileDownloader?: unknown
    @Input() referenceable?: boolean
    @Input() reloadKey?: unknown
    @Input() treeSize?: 'sm' | 'default' | 'lg'
    @Output() readonly referenceRequest = new EventEmitter<FileWorkbenchReferenceRequest>()
  }

  MockFileWorkbenchComponent = MockFileWorkbenchComponentImpl
  return {
    FileWorkbenchComponent: MockFileWorkbenchComponentImpl
  }
})

describe('ClawXpertConversationFilesComponent', () => {
  const conversationService = {
    getFiles: jest.fn(),
    getFile: jest.fn(),
    saveFile: jest.fn(),
    downloadFile: jest.fn(),
    uploadFile: jest.fn(),
    deleteFile: jest.fn()
  }
  const xpertService = {
    getWorkspaceFiles: jest.fn(),
    getWorkspaceFile: jest.fn(),
    saveWorkspaceFile: jest.fn(),
    downloadWorkspaceFile: jest.fn(),
    uploadWorkspaceFileToFolder: jest.fn(),
    deleteWorkspaceFile: jest.fn()
  }

  beforeEach(async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertConversationFilesComponent],
      providers: [
        {
          provide: ChatConversationService,
          useValue: conversationService
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('passes read-only mode by omitting the fileSaver loader', () => {
    const fixture = TestBed.createComponent(ClawXpertConversationFilesComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.componentRef.setInput('xpertId', 'xpert-1')
    fixture.componentRef.setInput('mode', 'readonly')
    fixture.detectChanges()

    const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent)).componentInstance as any

    expect(workbench.rootId).toBe('xpert-1')
    expect(workbench.fileSaver).toBeNull()
    expect(workbench.referenceable).toBe(true)
    expect(workbench.treeSize).toBe('sm')
  })

  it('passes editable mode by providing the fileSaver loader', () => {
    const fixture = TestBed.createComponent(ClawXpertConversationFilesComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.componentRef.setInput('xpertId', 'xpert-1')
    fixture.componentRef.setInput('mode', 'editable')
    fixture.componentRef.setInput('reloadKey', 3)
    fixture.detectChanges()

    const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent)).componentInstance as any

    expect(typeof workbench.filesLoader).toBe('function')
    expect(typeof workbench.fileLoader).toBe('function')
    expect(typeof workbench.fileSaver).toBe('function')
    expect(typeof workbench.fileDownloader).toBe('function')
    expect(workbench.reloadKey).toBe('personal:conversation-1:xpert-1:3')
  })

  it('loads the personal Xpert workspace without waiting for a conversation', () => {
    xpertService.getWorkspaceFiles.mockReturnValue(of([]))
    const fixture = TestBed.createComponent(ClawXpertConversationFilesComponent)
    fixture.componentRef.setInput('xpertId', 'xpert-1')
    fixture.detectChanges()

    const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent)).componentInstance as {
      rootId?: string | null
      filesLoader?: (path?: string) => unknown
    }
    ;(workbench.filesLoader as (path?: string) => unknown)('shared')

    expect(workbench.rootId).toBe('xpert-1')
    expect(xpertService.getWorkspaceFiles).toHaveBeenCalledWith('xpert-1', 'shared')
    expect(conversationService.getFiles).not.toHaveBeenCalled()
  })

  it('keeps Project workspace loading bound to its conversation', () => {
    conversationService.getFiles.mockReturnValue(of([]))
    const fixture = TestBed.createComponent(ClawXpertConversationFilesComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.componentRef.setInput('xpertId', 'xpert-1')
    fixture.componentRef.setInput('projectId', 'project-1')
    fixture.detectChanges()

    const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent)).componentInstance as {
      rootId?: string | null
      filesLoader?: (path?: string) => unknown
    }
    ;(workbench.filesLoader as (path?: string) => unknown)('docs')

    expect(workbench.rootId).toBe('conversation-1')
    expect(conversationService.getFiles).toHaveBeenCalledWith('conversation-1', 'docs')
    expect(xpertService.getWorkspaceFiles).not.toHaveBeenCalled()
  })

  it('re-emits file reference requests from the workbench', () => {
    const fixture = TestBed.createComponent(ClawXpertConversationFilesComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.detectChanges()

    const emitted: FileWorkbenchReferenceRequest[] = []
    fixture.componentInstance.referenceRequest.subscribe((value) => emitted.push(value))

    const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent)).componentInstance as any
    workbench.referenceRequest.emit({
      path: 'src/app.ts',
      text: 'const y = 2',
      startLine: 2,
      endLine: 2,
      language: 'typescript'
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
})
