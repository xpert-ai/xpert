jest.mock('../../../@shared/files/document/file-document.component', () => {
  const { Component, Input, Output, EventEmitter } = jest.requireActual('@angular/core')
  @Component({ standalone: true, selector: 'xp-file-document', template: '' })
  class FileDocumentComponent {
    @Input() active = true
    @Input() document: unknown
    @Input() backVisible: boolean
    @Output() back = new EventEmitter()
  }
  return { FileDocumentComponent }
})
jest.mock('../../../@core', () => ({
  ChatConversationService: class ChatConversationService {},
  XpertAPIService: class XpertAPIService {},
  getErrorMessage: (error: Error) => error.message,
  injectToastr: () => ({ success: jest.fn(), danger: jest.fn() })
}))
import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import type { TFile } from '@xpert-ai/contracts'
import { ChatConversationService, XpertAPIService } from '../../../@core'
import { WorkbenchArtifactPanelComponent } from './workbench-artifact-panel.component'
import { attachWorkspaceFile, createFileArtifactTab } from './workbench-artifact-tabs'

const remoteTab = () =>
  createFileArtifactTab(
    { name: 'Report.pdf', url: 'https://files/report?sig=1', mimeType: 'application/pdf', size: 3 * 1024 * 1024 },
    'assistant',
    {}
  )
const workspaceTab = (path = 'notes.md', projectId: string | null = 'project') =>
  attachWorkspaceFile(
    createFileArtifactTab({ name: path, url: '' }, 'assistant', { projectId }, undefined, path),
    'assistant',
    projectId ? 'conversation' : null,
    projectId
  )

describe('artifact file document', () => {
  const conversationService = {
    getFile: jest.fn(),
    downloadFile: jest.fn(),
    saveFile: jest.fn(),
    saveBinaryFile: jest.fn(),
    uploadFile: jest.fn()
  }
  const xpertService = {
    getWorkspaceFile: jest.fn(),
    downloadWorkspaceFile: jest.fn(),
    saveWorkspaceFile: jest.fn(),
    saveWorkspaceBinaryFile: jest.fn(),
    uploadWorkspaceFileToFolder: jest.fn()
  }
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  beforeEach(() => {
    conversationService.getFile.mockReturnValue(of({ filePath: 'notes.md', contents: '# Original' }))
    xpertService.getWorkspaceFile.mockReturnValue(of({ filePath: 'notes.md', contents: '# Original' }))
    conversationService.saveFile.mockImplementation((_, path: string, content: string) =>
      of({ filePath: path, contents: content })
    )
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() })
    TestBed.configureTestingModule({
      imports: [WorkbenchArtifactPanelComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ChatConversationService, useValue: conversationService },
        { provide: XpertAPIService, useValue: xpertService },
        { provide: Dialog, useValue: { open: jest.fn(() => ({ close: jest.fn() })) } }
      ]
    })
  })
  afterEach(() => {
    TestBed.resetTestingModule()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL })
    jest.clearAllMocks()
  })

  async function setup(tab = remoteTab(), mode = 'readonly') {
    const fixture = TestBed.createComponent(WorkbenchArtifactPanelComponent)
    fixture.componentRef.setInput('tab', tab)
    fixture.componentRef.setInput('mode', mode)
    fixture.detectChanges()
    await fixture.whenStable()
    await new Promise((resolve) => setTimeout(resolve, 0))
    fixture.detectChanges()
    return fixture
  }

  it('uses the shared file document for remote files without a size limit', async () => {
    const fixture = await setup()
    const state = fixture.componentInstance.document
    expect(fixture.debugElement.query(By.css('xp-file-document')).componentInstance.document).toBe(state)
    expect(state.activeFilePath()).toBe('Report.pdf')
    expect(state.activePreviewUrl()).toBe('https://files/report?sig=1')
    expect(state.isActiveFileEditable()).toBe(false)
    expect(state.canDownloadActiveFile()).toBe(true)
  })

  it('refreshes a signed URL in the same document component', async () => {
    const tab = remoteTab()
    const fixture = await setup(tab)
    const document = fixture.debugElement.query(By.css('xp-file-document')).componentInstance
    fixture.componentRef.setInput('tab', {
      ...tab,
      revision: 1,
      resource: {
        ...tab.resource,
        file: { ...tab.resource.file, url: 'https://files/report?sig=2' }
      }
    })
    fixture.detectChanges()
    await fixture.whenStable()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fixture.debugElement.query(By.css('xp-file-document')).componentInstance).toBe(document)
    expect(fixture.componentInstance.document.activePreviewUrl()).toBe('https://files/report?sig=2')
  })

  it('loads private workspace files with the scoped download API and releases the preview on close', async () => {
    conversationService.getFile.mockReturnValue(of({ filePath: 'report.pdf', mimeType: 'application/pdf' }))
    conversationService.downloadFile.mockReturnValue(of(new Blob(['private'], { type: 'application/pdf' })))
    const fixture = await setup(workspaceTab('report.pdf'))
    expect(conversationService.getFile).toHaveBeenCalledWith('conversation', 'report.pdf', undefined, undefined)
    expect(conversationService.downloadFile).toHaveBeenCalledWith('conversation', 'report.pdf')
    expect(fixture.componentInstance.document.activePreviewUrl()).toBe('blob:preview')
    fixture.destroy()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('keeps a personal tree file scoped to its assistant', async () => {
    await setup(workspaceTab('notes.md', null))
    expect(xpertService.getWorkspaceFile).toHaveBeenCalledWith('assistant', 'notes.md')
    expect(conversationService.getFile).not.toHaveBeenCalled()
  })

  it('preserves draft content on an output update and saves through the same workspace API', async () => {
    const tab = workspaceTab()
    const fixture = await setup(tab, 'editable')
    const state = fixture.componentInstance.document
    expect(state.panelMode()).toBe('view')
    await state.switchPanelMode('edit')
    state.draftContent.set('# My edits')
    fixture.componentRef.setInput('tab', { ...tab, revision: 1 })
    fixture.detectChanges()
    await fixture.whenStable()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.draftContent()).toBe('# My edits')
    expect(conversationService.getFile).toHaveBeenCalledTimes(1)
    await state.saveActiveFile()
    expect(conversationService.saveFile).toHaveBeenCalledWith('conversation', 'notes.md', '# My edits')
    expect(state.dirty()).toBe(false)
  })

  it('does not enable workspace editing without write access', async () => {
    const fixture = await setup(workspaceTab())
    await fixture.componentInstance.document.switchPanelMode('edit')
    expect(fixture.componentInstance.document.panelMode()).toBe('view')
    expect(fixture.componentInstance.fileSaver()).toBeNull()
    expect(fixture.componentInstance.fileUploader()).toBeNull()
    expect(fixture.componentInstance.binaryFileSaver()).toBeNull()
  })

  it('routes binary saves from editable artifact tabs to their original workspace', async () => {
    const file = new Blob(['presentation'])
    const project = await setup(workspaceTab(), 'editable')
    project.componentInstance.binaryFileSaver()!('slides/deck.pptx', file)
    expect(conversationService.saveBinaryFile).toHaveBeenCalledWith('conversation', 'slides/deck.pptx', file)
    const personal = await setup(workspaceTab('notes.md', null), 'editable')
    personal.componentInstance.binaryFileSaver()!('slides/deck.pptx', file)
    expect(xpertService.saveWorkspaceBinaryFile).toHaveBeenCalledWith('assistant', 'slides/deck.pptx', file)
    const remote = await setup(remoteTab(), 'editable')
    expect(remote.componentInstance.binaryFileSaver()).toBeNull()
  })

  it('allows cancelling a dirty close, and closes only after save or discard', async () => {
    const fixture = await setup(workspaceTab(), 'editable')
    const state = fixture.componentInstance.document
    const close = jest.fn()
    state.draftContent.set('# Unsaved')
    await state.guardDirtyBefore(close)
    expect(close).not.toHaveBeenCalled()
    await state.resolveDirtyDialog('cancel')
    expect(close).not.toHaveBeenCalled()
    await state.guardDirtyBefore(close)
    await state.resolveDirtyDialog('save')
    expect(conversationService.saveFile).toHaveBeenCalledWith('conversation', 'notes.md', '# Unsaved')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('ignores a file load that finishes after its tab has closed', async () => {
    let finish: (file: TFile) => void = () => undefined
    const file = new Promise<TFile>((resolve) => {
      finish = resolve
    })
    conversationService.getFile.mockReturnValue(file)
    const fixture = TestBed.createComponent(WorkbenchArtifactPanelComponent)
    fixture.componentRef.setInput('tab', workspaceTab())
    fixture.detectChanges()
    fixture.destroy()
    finish({ filePath: 'notes.md', contents: '# Too late' })
    await file
    await Promise.resolve()
    expect(fixture.componentInstance.document.activeFile()).toBeNull()
  })
})
