
import { booleanAttribute, Component, computed, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { injectEditorTheme } from '../../../@core'

export type FileEditorSelection = {
  text: string
  startLine: number
  endLine: number
}

type FileEditorReferenceButtonPosition = {
  top: number
  left: number
}

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, MonacoEditorModule],
  selector: 'pac-file-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss']
})
export class FileEditorComponent {
  // Inputs
  readonly fileName = input<string>()
  readonly content = model<string>()
  readonly referenceable = input(false)
  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly lineNumbers = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly wordWrap = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly selectionChange = output<FileEditorSelection | null>()
  readonly referenceSelection = output<FileEditorSelection>()

  // States
  readonly editorTheme = injectEditorTheme()

  readonly defaultOptions = {
    automaticLayout: true,
    language: 'markdown',
    glyphMargin: 0,
    minimap: {
      enabled: false
    }
  }

  readonly editorOptions = computed(() => {
    return {
      ...this.defaultOptions,
      theme: this.editorTheme(),
      lineNumbers: this.lineNumbers() ? 'on' : 'off',
      wordWrap: this.wordWrap(),
      language: this.fileName() ? this.mapFileLanguage(this.fileName()) : 'markdown',
      readOnly: !this.editable()
    }
  })

  readonly #editor = signal(null)
  readonly #selection = signal<FileEditorSelection | null>(null)
  readonly #referenceButtonPosition = signal<FileEditorReferenceButtonPosition | null>(null)
  readonly floatingReferenceButtonPosition = computed(() =>
    this.referenceable() && this.#selection() ? this.#referenceButtonPosition() : null
  )

  // Editor
  onInit(editor: any) {
    this.#editor.set(editor)
    const syncSelection = () => {
      const selection = readEditorSelection(editor)
      this.#selection.set(selection)
      this.selectionChange.emit(selection)
      this.#referenceButtonPosition.set(readReferenceButtonPosition(editor))
    }

    editor.onDidChangeCursorSelection(syncSelection)
    editor.onDidScrollChange?.(() => {
      this.#referenceButtonPosition.set(readReferenceButtonPosition(editor))
    })
    editor.onDidLayoutChange?.(() => {
      this.#referenceButtonPosition.set(readReferenceButtonPosition(editor))
    })
  }

  onChange(event: string) {
    this.content.set(event)
  }

  onResized() {
    this.#editor()?.layout()
    this.#referenceButtonPosition.set(readReferenceButtonPosition(this.#editor()))
  }

  mapFileLanguage(url: string) {
    return mapFileLanguageFromPath(url)
  }

  emitReferenceSelection() {
    const selection = this.#selection()
    if (!selection) {
      return
    }

    this.referenceSelection.emit(selection)
  }
}

export function mapFileLanguageFromPath(url: string) {
  const extension = url.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'js':
    case 'jsx':
      return 'javascript'
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'json':
      return 'json'
    case 'md':
      return 'markdown'
    case 'xml':
      return 'xml'
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'py':
      return 'python'
    case 'java':
      return 'java'
    case 'c':
      return 'c'
    case 'cpp':
      return 'cpp'
    case 'cs':
      return 'csharp'
    case 'php':
      return 'php'
    case 'rb':
      return 'ruby'
    case 'go':
      return 'go'
    case 'rs':
      return 'rust'
    case 'swift':
      return 'swift'
    case 'kt':
      return 'kotlin'
    default:
      return 'plaintext'
  }
}

function readEditorSelection(editor: {
  getSelection?: () => {
    startLineNumber?: number
    endLineNumber?: number
    endColumn?: number
    isEmpty?: () => boolean
  } | null
  getModel?: () => {
    getValueInRange?: (range: unknown) => string
  } | null
}): FileEditorSelection | null {
  const selection = editor.getSelection?.()
  const model = editor.getModel?.()
  if (!selection || !model || selection.isEmpty?.()) {
    return null
  }

  const text = model.getValueInRange?.(selection) ?? ''
  if (!text.trim().length) {
    return null
  }

  const startLine = selection.startLineNumber
  const endLine = selection.endLineNumber
  if (!startLine || !endLine) {
    return null
  }

  return {
    text,
    startLine,
    endLine
  }
}

function readReferenceButtonPosition(editor: {
  getSelection?: () => {
    endLineNumber?: number
    endColumn?: number
    isEmpty?: () => boolean
  } | null
  getScrolledVisiblePosition?: (position: {
    lineNumber: number
    column: number
  }) => { top: number; left: number; height: number } | null
  getDomNode?: () => {
    getBoundingClientRect: () => {
      top: number
      left: number
      width: number
      height: number
    }
    querySelector?: (selector: string) => {
      getBoundingClientRect: () => {
        top: number
        left: number
      }
    } | null
  } | null
} | null): FileEditorReferenceButtonPosition | null {
  const selection = editor?.getSelection?.()
  if (!selection || selection.isEmpty?.()) {
    return null
  }

  const lineNumber = selection.endLineNumber
  const column = selection.endColumn
  if (!lineNumber || !column) {
    return null
  }

  const coordinates = editor?.getScrolledVisiblePosition?.({
    lineNumber,
    column
  })
  const editorDom = editor?.getDomNode?.()
  if (!coordinates || !editorDom) {
    return null
  }

  const editorRect = editorDom.getBoundingClientRect()
  const viewLinesRect = editorDom.querySelector?.('.view-lines')?.getBoundingClientRect?.() ?? editorRect
  const rawLeft = viewLinesRect.left - editorRect.left + coordinates.left + 8
  const rawTop = viewLinesRect.top - editorRect.top + coordinates.top + coordinates.height + 8

  return {
    left: clamp(rawLeft, 8, Math.max(8, editorRect.width - 128)),
    top: clamp(rawTop, 8, Math.max(8, editorRect.height - 40))
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
