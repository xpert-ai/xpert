import { provideHttpClient } from '@angular/common/http'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing'
import { TranslateModule } from '@ngx-translate/core'
import { SpreadsheetEditorComponent } from './spreadsheet-editor.component'

interface SheetEvent {
  type?: number
  cancel?: boolean
  params?: { unitId: string }
}
const mockListeners = new Map<string, (event: SheetEvent) => void>()
const mockPermission = {
  setMode: jest.fn(async (_mode: string) => undefined),
  setPoint: jest.fn(async (_point: string, _value: boolean) => undefined)
}
const mockWorkbook = {
  getWorkbookPermission: () => mockPermission,
  setEditable: jest.fn(),
  getId: () => 'workbook',
  isCellEditing: jest.fn(() => false),
  endEditingAsync: jest.fn(async () => undefined),
  save: jest.fn(() => ({ id: 'workbook' }))
}
const mockAPI = {
  createWorkbook: jest.fn(() => mockWorkbook),
  getActiveWorkbook: jest.fn(() => mockWorkbook),
  setPermissionDialogVisible: jest.fn(),
  getCurrentLifecycleStage: () => 4,
  Enum: { LifecycleStages: { Steady: 4 }, WorkbookPermissionPoint: { CopyContent: 'copy', Export: 'export' } },
  Event: { CommandExecuted: 'command', BeforeSheetEditStart: 'edit', BeforeUndo: 'undo', BeforeRedo: 'redo' },
  addEvent: jest.fn((event: string, listener: (event: SheetEvent) => void) => {
    mockListeners.set(event, listener)
    return { dispose: () => mockListeners.delete(event) }
  })
}
jest.mock('@univerjs/presets', () => ({
  createUniver: () => ({ univer: { dispose: jest.fn() }, univerAPI: mockAPI }),
  LocaleType: { ZH_CN: 'zhCN' },
  mergeLocales: (locale: object) => locale,
  CommandType: { MUTATION: 2 }
}))
jest.mock('@univerjs/preset-sheets-core', () => ({ UniverSheetsCorePreset: () => ({}) }))
jest.mock('@univerjs/preset-sheets-core/locales/zh-CN', () => ({ default: {} }))
jest.mock('./univer-styles', () => ({ ensureUniverStylesheet: async () => undefined }))
jest.mock('./spreadsheet-file.utils', () => ({
  importSpreadsheetFile: async () => ({ id: 'workbook' }),
  exportSpreadsheetFile: async () => new File(['snapshot'], 'budget.xlsx')
}))

describe('spreadsheet view mode', () => {
  let fixture: ComponentFixture<SpreadsheetEditorComponent>
  let http: HttpTestingController

  beforeEach(async () => {
    jest.clearAllMocks()
    mockListeners.clear()
    mockWorkbook.isCellEditing.mockReturnValue(false)
    await TestBed.configureTestingModule({
      imports: [SpreadsheetEditorComponent, TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents()
    http = TestBed.inject(HttpTestingController)
    fixture = TestBed.createComponent(SpreadsheetEditorComponent)
    fixture.componentRef.setInput('sourceUrl', 'https://files/budget.xlsx')
    fixture.componentRef.setInput('fileName', 'budget.xlsx')
    fixture.componentRef.setInput('editable', false)
    fixture.detectChanges()
    http.expectOne('https://files/budget.xlsx').flush(new Blob(['xlsx']))
    await new Promise((resolve) => setTimeout(resolve, 250))
    fixture.detectChanges()
  })
  afterEach(() => {
    fixture.destroy()
    http.verify()
  })

  function container(): HTMLElement {
    return fixture.nativeElement.querySelector('.xp-univer-editor__container')
  }

  it('disables workbook editing and its permission dialog, including after initialization', () => {
    expect(mockWorkbook.setEditable).toHaveBeenLastCalledWith(false)
    expect(mockAPI.setPermissionDialogVisible).toHaveBeenLastCalledWith(false)
    const event: SheetEvent = {}
    mockListeners.get('edit')?.(event)
    expect(event.cancel).toBe(true)
    expect(mockPermission.setMode).toHaveBeenLastCalledWith('viewer')
    expect(mockPermission.setPoint).toHaveBeenCalledWith('copy', true)
    expect(mockPermission.setPoint).toHaveBeenCalledWith('export', true)
    for (const command of ['undo', 'redo']) {
      const historyEvent: SheetEvent = {}
      mockListeners.get(command)?.(historyEvent)
      expect(historyEvent.cancel).toBe(true)
    }
  })

  it('silently blocks input, paste, cut, deletion, and editing shortcuts while allowing copy and navigation', () => {
    for (const key of ['x', 'Delete', 'Backspace', 'Enter', 'F2']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
      container().dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    for (const type of ['paste', 'cut', 'beforeinput']) {
      const event = new Event(type, { cancelable: true, bubbles: true })
      container().dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    for (const key of ['c', 'a']) {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true, bubbles: true })
      container().dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    for (const key of ['ArrowDown', 'ArrowRight', 'PageDown', 'Tab', 'Escape']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
      container().dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
  })

  it('does not mark viewing or recalculation as a user edit and enables editing only in edit mode', () => {
    const dirty = jest.fn()
    fixture.componentInstance.dirtyChange.subscribe(dirty)
    container().dispatchEvent(new Event('pointerdown'))
    mockListeners.get('command')?.({ type: 2, params: { unitId: 'workbook' } })
    expect(dirty).not.toHaveBeenCalled()
    fixture.componentRef.setInput('editable', true)
    fixture.detectChanges()
    expect(mockWorkbook.setEditable).toHaveBeenLastCalledWith(true)
    const event: SheetEvent = {}
    mockListeners.get('edit')?.(event)
    expect(event.cancel).toBeUndefined()
    mockListeners.get('command')?.({ type: 2, params: { unitId: 'workbook' } })
    expect(dirty).toHaveBeenCalledWith(true)
  })

  it('does not publish cell-input initialization or typing as a committed workbook edit', () => {
    const dirty = jest.fn()
    fixture.componentInstance.dirtyChange.subscribe(dirty)
    fixture.componentRef.setInput('editable', true)
    fixture.detectChanges()
    container().dispatchEvent(new Event('pointerdown'))
    mockListeners.get('command')?.({ type: 2, params: { unitId: '__INTERNAL_EDITOR__DOCS_NORMAL' } })
    mockListeners.get('command')?.({ type: 2, params: { unitId: '__INTERNAL_EDITOR__DOCS_FORMULA_BAR' } })
    expect(dirty).not.toHaveBeenCalled()
    mockWorkbook.isCellEditing.mockReturnValue(true)
    container().dispatchEvent(new FocusEvent('focusout', { relatedTarget: null, bubbles: true }))
    expect(mockWorkbook.endEditingAsync).not.toHaveBeenCalled()
    mockListeners.get('command')?.({ type: 2, params: { unitId: 'workbook' } })
    expect(dirty).toHaveBeenCalledTimes(1)
  })

  it('ends an active cell edit when leaving edit mode and captures background drafts without ending typing', async () => {
    fixture.componentRef.setInput('editable', true)
    fixture.detectChanges()
    await fixture.componentInstance.exportFile(false)
    expect(mockWorkbook.endEditingAsync).not.toHaveBeenCalled()
    mockWorkbook.isCellEditing.mockReturnValue(true)
    fixture.componentRef.setInput('editable', false)
    fixture.detectChanges()
    expect(mockWorkbook.endEditingAsync).toHaveBeenCalledWith(true)
    expect(mockWorkbook.setEditable).toHaveBeenLastCalledWith(false)
    expect(mockAPI.setPermissionDialogVisible).toHaveBeenLastCalledWith(false)
  })
})
