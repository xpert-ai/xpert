import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild
} from '@angular/core'
import { parseDocx, type Document } from '@eigenpal/docx-editor-core'
import { DocxEditor, type DocxEditorRef } from '@eigenpal/docx-editor-react'
import zhCNDocxEditorI18n from '@eigenpal/docx-editor-i18n/zh-CN'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createDocxFile, normalizeDocxTableWidths } from './docx-file.utils'

@Component({
  standalone: true,
  selector: 'xp-docx-editor',
  template: '<div #editorHost class="xp-docx-editor__host"></div>',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'xp-docx-editor'
  },
  styles: [
    `
      .xp-docx-editor,
      .xp-docx-editor__host,
      .xp-docx-editor__host > .ep-root {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
      }

      .xp-docx-editor__host {
        overflow: hidden;
        isolation: isolate;
      }

      .xp-docx-editor .ep-root *,
      .xp-docx-editor .ep-root *::before,
      .xp-docx-editor .ep-root *::after {
        box-sizing: border-box;
      }

      .xp-docx-editor .ep-root [role='menubar'] > div > div[style*='position: fixed'],
      .xp-docx-editor .ep-root [role='menu'],
      .xp-docx-editor .ep-root [role='listbox'] {
        z-index: 140 !important;
        border-color: var(--color-divider-regular) !important;
        background: var(--color-components-card-bg) !important;
        color: var(--color-text-primary) !important;
        box-shadow:
          0 12px 32px color-mix(in srgb, var(--color-text-primary) 16%, transparent),
          0 2px 8px color-mix(in srgb, var(--color-text-primary) 9%, transparent) !important;
      }

      .xp-docx-editor .ep-root [data-radix-popper-content-wrapper] {
        z-index: 140 !important;
      }
    `
  ]
})
export class DocxEditorComponent implements OnDestroy {
  readonly documentBuffer = input<ArrayBuffer | null>(null)
  readonly fileName = input('document.docx')
  readonly editable = input(true)

  readonly dirtyChange = output<boolean>()
  readonly saveRequest = output<File>()
  readonly editorError = output<Error>()

  private readonly editorHost = viewChild.required<ElementRef<HTMLElement>>('editorHost')
  readonly #zone = inject(NgZone)
  #root: Root | null = null
  #editorRef: DocxEditorRef | null = null
  #preparedDocument: Document | null = null
  #preparedBuffer: ArrayBuffer | null = null
  #loadingBuffer: ArrayBuffer | null = null
  #loadRevision = 0
  #renderKey = 0
  #destroyed = false

  constructor() {
    afterNextRender(() => {
      if (this.#destroyed) {
        return
      }

      this.#root = createRoot(this.editorHost().nativeElement)
      void this.prepareEditor()
    })

    effect(() => {
      this.documentBuffer()
      this.fileName()
      this.editable()

      if (!this.#root) {
        return
      }

      const buffer = this.documentBuffer()
      if (!buffer || buffer === this.#preparedBuffer) {
        this.renderEditor()
      } else if (buffer !== this.#loadingBuffer) {
        void this.prepareEditor()
      }
    })
  }

  ngOnDestroy() {
    this.#destroyed = true
    this.#loadRevision++
    this.#loadingBuffer = null
    this.#preparedBuffer = null
    this.#preparedDocument = null
    this.#editorRef = null
    this.#root?.unmount()
    this.#root = null
  }

  async save() {
    const buffer = await this.#editorRef?.save()
    if (!buffer) {
      return null
    }

    return createDocxFile(buffer, this.fileName())
  }

  reload() {
    if (!this.#root || !this.#preparedDocument) {
      return
    }

    this.#renderKey++
    this.renderEditor()
  }

  private async prepareEditor() {
    const buffer = this.documentBuffer()
    const loadRevision = ++this.#loadRevision

    if (!buffer) {
      this.#loadingBuffer = null
      this.#preparedBuffer = null
      this.#preparedDocument = null
      this.renderEditor()
      return
    }

    this.#loadingBuffer = buffer
    this.#preparedBuffer = null
    this.#preparedDocument = null
    this.renderStatus('Loading document...')

    try {
      const document = normalizeDocxTableWidths(await parseDocx(buffer))
      if (this.#destroyed || loadRevision !== this.#loadRevision) {
        return
      }

      this.#loadingBuffer = null
      this.#preparedBuffer = buffer
      this.#preparedDocument = document
      this.#renderKey++
      this.renderEditor()
    } catch (error) {
      if (this.#destroyed || loadRevision !== this.#loadRevision) {
        return
      }

      this.#loadingBuffer = null
      this.renderStatus('Unable to load this document.')
      this.emitError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private renderStatus(message: string) {
    this.#editorRef = null
    this.#root?.render(
      createElement('div', { className: 'flex h-full items-center justify-center text-sm text-text-tertiary' }, message)
    )
  }

  private renderEditor() {
    const buffer = this.documentBuffer()
    if (!this.#root) {
      return
    }

    if (!buffer) {
      this.renderStatus('No document loaded.')
      return
    }

    if (buffer !== this.#preparedBuffer || !this.#preparedDocument) {
      return
    }

    const mode = this.editable() ? 'editing' : 'viewing'
    this.#root.render(
      createElement(DocxEditor, {
        key: this.#renderKey,
        ref: (instance: DocxEditorRef | null) => {
          this.#editorRef = instance
        },
        document: this.#preparedDocument,
        mode,
        author: 'Xpert',
        i18n: zhCNDocxEditorI18n,
        documentName: this.fileName(),
        documentNameEditable: false,
        showFileOpen: false,
        showZoomControl: true,
        showRuler: true,
        initialZoom: 0.92,
        onChange: () => this.emitDirtyChange(true),
        onSave: (savedBuffer) => this.emitSaveRequest(savedBuffer),
        onError: (error) => this.emitError(error),
        style: { height: '100%' }
      })
    )
  }

  private emitDirtyChange(dirty: boolean) {
    this.#zone.run(() => this.dirtyChange.emit(dirty))
  }

  private emitSaveRequest(buffer: ArrayBuffer) {
    this.#zone.run(() => this.saveRequest.emit(createDocxFile(buffer, this.fileName())))
  }

  private emitError(error: Error) {
    this.#zone.run(() => this.editorError.emit(error))
  }
}
