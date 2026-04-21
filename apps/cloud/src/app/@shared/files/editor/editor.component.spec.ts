import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { FileEditorComponent, FileEditorSelection } from './editor.component'

jest.mock('../../../@core', () => ({
  injectEditorTheme: () => signal('vs')
}))

describe('FileEditorComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('emits selection details for non-empty Monaco selections', () => {
    const component = TestBed.runInInjectionContext(() => new FileEditorComponent())
    const emitted: Array<FileEditorSelection | null> = []
    component.selectionChange.subscribe((value) => emitted.push(value))

    let selectionListener: (() => void) | null = null
    const editor = {
      getSelection: jest.fn(() => ({
        startLineNumber: 2,
        endLineNumber: 4,
        isEmpty: () => false
      })),
      getModel: jest.fn(() => ({
        getValueInRange: jest.fn(() => 'line 2\nline 3\nline 4')
      })),
      onDidChangeCursorSelection: jest.fn((listener: () => void) => {
        selectionListener = listener
      })
    }

    component.onInit(editor)
    selectionListener?.()

    expect(emitted).toEqual([
      {
        text: 'line 2\nline 3\nline 4',
        startLine: 2,
        endLine: 4
      }
    ])
  })

  it('emits null for collapsed or whitespace-only selections', () => {
    const component = TestBed.runInInjectionContext(() => new FileEditorComponent())
    const emitted: Array<FileEditorSelection | null> = []
    component.selectionChange.subscribe((value) => emitted.push(value))

    let selectionListener: (() => void) | null = null
    const editor = {
      getSelection: jest.fn(() => ({
        startLineNumber: 3,
        endLineNumber: 3,
        isEmpty: () => true
      })),
      getModel: jest.fn(() => ({
        getValueInRange: jest.fn(() => '   ')
      })),
      onDidChangeCursorSelection: jest.fn((listener: () => void) => {
        selectionListener = listener
      })
    }

    component.onInit(editor)
    selectionListener?.()

    expect(emitted).toEqual([null])
  })

  it('emits the current selection when the floating reference action is triggered', () => {
    const component = TestBed.runInInjectionContext(() => new FileEditorComponent())
    const emitted: FileEditorSelection[] = []
    component.referenceSelection.subscribe((value) => emitted.push(value))

    let selectionListener: (() => void) | null = null
    const editor = {
      getSelection: jest.fn(() => ({
        startLineNumber: 5,
        endLineNumber: 6,
        endColumn: 12,
        isEmpty: () => false
      })),
      getModel: jest.fn(() => ({
        getValueInRange: jest.fn(() => 'alpha\nbeta')
      })),
      getScrolledVisiblePosition: jest.fn(() => ({
        top: 40,
        left: 80,
        height: 18
      })),
      getDomNode: jest.fn(() => ({
        getBoundingClientRect: () => ({
          top: 10,
          left: 20,
          width: 640,
          height: 320
        }),
        querySelector: () => ({
          getBoundingClientRect: () => ({
            top: 10,
            left: 20
          })
        })
      })),
      onDidChangeCursorSelection: jest.fn((listener: () => void) => {
        selectionListener = listener
      })
    }

    component.onInit(editor)
    selectionListener?.()
    component.emitReferenceSelection()

    expect(emitted).toEqual([
      {
        text: 'alpha\nbeta',
        startLine: 5,
        endLine: 6
      }
    ])
  })
})
