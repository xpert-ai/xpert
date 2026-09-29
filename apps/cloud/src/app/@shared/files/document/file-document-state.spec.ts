import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import type { TFile } from '@xpert-ai/contracts'
import { FileDocumentState } from './file-document-state'
import { FileDocumentStore } from './file-document-store'
import { FileViewerComponent } from '../viewer/viewer.component'

jest.mock('../../../@core', () => ({
  getErrorMessage: (error: Error) => error.message,
  injectToastr: () => ({ success: jest.fn(), danger: jest.fn() })
}))
jest.mock('../viewer/viewer.component', () => ({ FileViewerComponent: class {} }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function binaryFile(value: number) {
  const buffer = new Uint8Array([value]).buffer
  const file = new File([buffer], 'budget.xlsx')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
  return file
}

describe('shared file drafts', () => {
  const upload = jest.fn(async (_file: File, _path: string) => undefined)
  const save = jest.fn(async (filePath: string, contents: string): Promise<TFile> => ({ filePath, contents }))
  const load = jest.fn(
    async (filePath: string): Promise<TFile> =>
      filePath.endsWith('.xlsx')
        ? { filePath, fileUrl: 'https://files/budget.xlsx' }
        : { filePath, contents: 'original' }
  )
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  let sequence = 0

  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => `blob:draft-${sequence++}`)
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() })
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [FileDocumentStore, { provide: Dialog, useValue: { open: jest.fn() } }]
    })
  })
  afterEach(() => {
    TestBed.resetTestingModule()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke })
  })

  function create(scope = 'xpert:assistant') {
    return TestBed.runInInjectionContext(
      () =>
        new FileDocumentState({
          rootId: () => 'view',
          documentScope: () => scope,
          fileLoader: () => load,
          fileSaver: () => save,
          fileUploader: () => upload,
          fileDownloader: () => null,
          binaryFileSaver: () => null,
          referenceable: () => false,
          onReference: () => undefined,
          openInEditMode: false
        })
    )
  }

  async function pair(path = 'notes.md') {
    const tree = create()
    const tab = create()
    await tree.loadActiveFile(path)
    await tab.loadActiveFile(path)
    await tree.switchPanelMode('edit')
    return { tree, tab }
  }

  function editor(state: FileDocumentState, value: number) {
    const viewer = new FileViewerComponent()
    viewer.finishEditing = jest.fn(async () => undefined)
    viewer.exportSpreadsheetFile = jest.fn(async () => binaryFile(value))
    viewer.reloadSpreadsheet = jest.fn(async () => undefined)
    state.fileViewer.set(viewer)
    return viewer
  }

  it('shares text drafts immediately with a view-only entry and only writes on Save', async () => {
    const { tree, tab } = await pair()
    tree.changeContent('draft')
    expect(tab.draftContent()).toBe('draft')
    expect(tab.dirty()).toBe(true)
    expect(tab.panelMode()).toBe('view')
    expect(save).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(await tab.saveActiveFile()).toBe(true)
    expect(save).toHaveBeenCalledWith('notes.md', 'draft')
    expect(tree.dirty()).toBe(false)
    expect(tab.dirty()).toBe(false)
    expect(tree.activeFile()?.contents).toBe('draft')
  })

  it('synchronizes discard both ways and keeps display modes independent', async () => {
    const { tree, tab } = await pair()
    tree.changeContent('draft')
    tab.discardActiveFileChanges()
    expect(tree.draftContent()).toBe('original')
    expect(tree.dirty()).toBe(false)
    expect(tree.panelMode()).toBe('edit')
    expect(tab.panelMode()).toBe('view')
    await tab.switchPanelMode('edit')
    tab.changeContent('second draft')
    expect(tree.draftContent()).toBe('second draft')
  })

  it('joins an existing unsaved draft using a normalized path, without loading old server content', async () => {
    const { tree } = await pair()
    tree.changeContent('draft')
    const third = create()
    load.mockClear()
    await third.loadActiveFile('/workspace/notes.md')
    expect(third.draftContent()).toBe('draft')
    expect(load).not.toHaveBeenCalled()
    const unrelated = create('xpert:another')
    await unrelated.loadActiveFile('notes.md')
    expect(unrelated.draftContent()).toBe('original')
  })

  it('saves the latest rich draft from the other entry, never its stale editor', async () => {
    const { tree, tab } = await pair('budget.xlsx')
    const writer = editor(tree, 42)
    const stale = editor(tab, 0)
    tree.changeBinary(true)
    expect(tab.dirty()).toBe(true)
    expect(upload).not.toHaveBeenCalled()
    expect(await tab.saveActiveFile()).toBe(true)
    expect(stale.exportSpreadsheetFile).not.toHaveBeenCalled()
    expect(writer.exportSpreadsheetFile).toHaveBeenCalledWith(true)
    expect(new Uint8Array(await upload.mock.calls[0][0].arrayBuffer())[0]).toBe(42)
    expect(tree.dirty()).toBe(false)
    expect(tab.dirty()).toBe(false)
    expect(tree.activePreviewUrl()).toBe(tab.activePreviewUrl())
  })

  it('ignores editor initialization clean events and restores both rich views on discard', async () => {
    const { tree, tab } = await pair('budget.xlsx')
    editor(tree, 42)
    editor(tab, 0)
    tree.changeBinary(true)
    tab.changeBinary(false)
    expect(tab.dirty()).toBe(true)
    tab.discardActiveFileChanges()
    await Promise.resolve()
    expect(tree.dirty()).toBe(false)
    expect(tree.activePreviewUrl()).toBe('https://files/budget.xlsx')
    expect(tab.activePreviewUrl()).toBe('https://files/budget.xlsx')
    expect(upload).not.toHaveBeenCalled()
  })

  it('prevents an older export or a pending export after discard from resurrecting a draft', async () => {
    const { tree, tab } = await pair('budget.xlsx')
    const viewer = editor(tree, 9)
    const old = deferred<File>()
    jest.mocked(viewer.exportSpreadsheetFile).mockReturnValueOnce(old.promise)
    tree.changeBinary(true)
    await Promise.resolve()
    tree.changeBinary(true)
    const store = TestBed.inject(FileDocumentStore)
    await store.get(store.key('xpert:assistant', 'budget.xlsx'))?.flush()
    expect(new Uint8Array(tab.documentBuffer()!)[0]).toBe(9)
    old.resolve(binaryFile(1))
    await Promise.resolve()
    await Promise.resolve()
    expect(new Uint8Array(tab.documentBuffer()!)[0]).toBe(9)
    tree.discardActiveFileChanges()
    expect(tab.dirty()).toBe(false)
  })

  it('does not overwrite a draft with a file request that started earlier', async () => {
    const { tree, tab } = await pair()
    const response = deferred<TFile>()
    load.mockReturnValueOnce(response.promise)
    const loading = tab.loadActiveFile('notes.md')
    tree.changeContent('newer edit')
    response.resolve({ filePath: 'notes.md', contents: 'old server content' })
    await loading
    expect(tab.draftContent()).toBe('newer edit')
    expect(tree.draftContent()).toBe('newer edit')
  })

  it('commits the active cell before unmounting, restores the draft on return, and can save without a hidden editor', async () => {
    const { tree, tab } = await pair('budget.xlsx')
    const writer = editor(tree, 42)
    jest.mocked(writer.finishEditing).mockImplementation(() => {
      tree.changeBinary(true)
      return Promise.resolve()
    })
    tree.suspendView()
    expect(writer.finishEditing).toHaveBeenCalledTimes(1)
    tree.fileViewer.set(undefined)
    const store = TestBed.inject(FileDocumentStore)
    await store.get(store.key('xpert:assistant', 'budget.xlsx'))?.flush()
    expect(new Uint8Array(tab.documentBuffer()!)[0]).toBe(42)
    tree.resumeView()
    expect(new Uint8Array(tree.documentBuffer()!)[0]).toBe(42)
    expect(tree.activePreviewUrl()).toBe(tab.activePreviewUrl())
    expect(upload).not.toHaveBeenCalled()
    expect(await tab.saveActiveFile()).toBe(true)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(tree.dirty()).toBe(false)
  })

  it('locks both entries during a save and retains the draft when the write fails', async () => {
    const { tree, tab } = await pair()
    tree.changeContent('draft')
    const pending = deferred<TFile>()
    save.mockReturnValueOnce(pending.promise)
    const saving = tab.saveActiveFile()
    await Promise.resolve()
    await Promise.resolve()
    expect(tree.saving()).toBe(true)
    tree.changeContent('must not overwrite pending save')
    expect(tree.draftContent()).toBe('draft')
    pending.resolve({ filePath: 'notes.md', contents: 'draft' })
    expect(await saving).toBe(true)
    tree.changeContent('retry draft')
    save.mockRejectedValueOnce(new Error('offline'))
    expect(await tree.saveActiveFile()).toBe(false)
    expect(tab.draftContent()).toBe('retry draft')
    expect(tab.dirty()).toBe(true)
    expect(tab.saving()).toBe(false)
  })
})
