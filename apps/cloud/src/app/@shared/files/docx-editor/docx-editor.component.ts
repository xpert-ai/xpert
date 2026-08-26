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
  signal,
  viewChild
} from '@angular/core'
import { parseDocx, repackDocx } from '@eigenpal/docx-editor-core/docx'
import type { Document } from '@eigenpal/docx-editor-core/types/document'
import { toProseDoc, updateDocumentContent } from '@eigenpal/docx-editor-core/prosemirror/conversion'
import {
  createDocumentContextPlugin,
  createDocumentStylesPlugin,
  ensureParaIdsInState
} from '@eigenpal/docx-editor-core/prosemirror'
import { createStarterKit, ExtensionManager } from '@eigenpal/docx-editor-core/prosemirror/extensions'
import {
  computeLayout,
  createLayoutScheduler,
  stripScrollFlag,
  type LayoutScheduler
} from '@eigenpal/docx-editor-core/editor'
import {
  DEFAULT_TEXTBOX_MARGINS,
  DEFAULT_TEXTBOX_WIDTH,
  assertExhaustiveFlowBlock,
  type FlowBlock,
  type Measure
} from '@eigenpal/docx-editor-core/layout-engine'
import {
  getColumns,
  getMargins,
  getPageSize,
  measureBlocksWithFloats,
  measureParagraph,
  measureTableBlock,
  resolveHeaderFooter,
  clickToPositionDom,
  getCaretPositionFromDom,
  getSelectionRectsFromDom,
  type FloatingImageZone
} from '@eigenpal/docx-editor-core/layout-bridge'
import { buildBlockLookup, renderPages } from '@eigenpal/docx-editor-core/layout-painter'
import { createDocxFile, normalizeDocxTableWidths } from './docx-file.utils'
import { EditorState, TextSelection } from 'prosemirror-state'
import { toggleMark } from 'prosemirror-commands'
import { EditorView } from 'prosemirror-view'
import { redo, undo } from 'prosemirror-history'

@Component({
  standalone: true,
  selector: 'xp-docx-editor',
  template: `
    <div class="xp-docx-editor__shell">
      <div class="xp-docx-editor__toolbar" role="toolbar" aria-label="Document editing toolbar">
        <button type="button" class="xp-docx-editor__tool" [disabled]="!editable()" title="Undo" (click)="undoEdit()">
          <span aria-hidden="true">↶</span>
          <span class="sr-only">Undo</span>
        </button>
        <button type="button" class="xp-docx-editor__tool" [disabled]="!editable()" title="Redo" (click)="redoEdit()">
          <span aria-hidden="true">↷</span>
          <span class="sr-only">Redo</span>
        </button>
        <span class="xp-docx-editor__separator" aria-hidden="true"></span>
        <button
          type="button"
          class="xp-docx-editor__tool xp-docx-editor__tool--text"
          [disabled]="!editable()"
          title="Bold"
          (click)="toggleBold()"
        >
          B
        </button>
        <button
          type="button"
          class="xp-docx-editor__tool xp-docx-editor__tool--text xp-docx-editor__tool--italic"
          [disabled]="!editable()"
          title="Italic"
          (click)="toggleItalic()"
        >
          I
        </button>
        <button
          type="button"
          class="xp-docx-editor__tool xp-docx-editor__tool--text xp-docx-editor__tool--underline"
          [disabled]="!editable()"
          title="Underline"
          (click)="toggleUnderline()"
        >
          U
        </button>
        <span class="xp-docx-editor__separator" aria-hidden="true"></span>
        <span class="xp-docx-editor__status" aria-live="polite">{{ statusMessage() }}</span>
      </div>

      <div #editorViewport class="xp-docx-editor__viewport" (mousedown)="handleViewportMouseDown($event)">
        <div #pages class="xp-docx-editor__pages"></div>
        <div #selectionOverlay class="xp-docx-editor__selection-overlay" aria-hidden="true"></div>
        <div #editorHost class="xp-docx-editor__hidden-pm"></div>
      </div>
    </div>
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'xp-docx-editor'
  },
  styles: [
    `
      .xp-docx-editor,
      .xp-docx-editor__shell {
        display: flex;
        width: 100%;
        height: 100%;
        min-height: 0;
        flex-direction: column;
      }

      .xp-docx-editor__toolbar {
        display: flex;
        min-height: 44px;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        border-bottom: 1px solid var(--color-divider-regular);
        background: var(--color-components-card-bg);
        color: var(--color-text-primary);
        box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text-primary) 8%, transparent);
        z-index: 3;
      }

      .xp-docx-editor__tool {
        display: inline-flex;
        height: 30px;
        min-width: 30px;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        border-radius: 5px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        line-height: 1;
      }

      .xp-docx-editor__tool:hover:not(:disabled) {
        border-color: var(--color-divider-regular);
        background: var(--color-background-default-subtle);
      }

      .xp-docx-editor__tool:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .xp-docx-editor__tool--text {
        font-weight: 700;
      }

      .xp-docx-editor__tool--italic {
        font-style: italic;
      }

      .xp-docx-editor__tool--underline {
        text-decoration: underline;
      }

      .xp-docx-editor__separator {
        width: 1px;
        height: 22px;
        margin: 0 4px;
        background: var(--color-divider-regular);
      }

      .xp-docx-editor__status {
        min-width: 0;
        margin-left: auto;
        overflow: hidden;
        color: var(--color-text-tertiary);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .xp-docx-editor__viewport {
        position: relative;
        min-height: 0;
        flex: 1;
        overflow: auto;
        background: var(--color-background-default-subtle);
        isolation: isolate;
      }

      .xp-docx-editor__pages {
        position: relative;
        z-index: 1;
        min-height: 100%;
      }

      .xp-docx-editor__selection-overlay {
        position: absolute;
        z-index: 2;
        inset: 0;
        pointer-events: none;
      }

      .xp-docx-editor__caret {
        position: absolute;
        width: 2px;
        background: var(--color-primary);
        animation: xp-docx-editor-caret-blink 1.05s steps(1) infinite;
      }

      .xp-docx-editor__selection {
        position: absolute;
        background: color-mix(in srgb, var(--color-primary) 22%, transparent);
      }

      .xp-docx-editor__hidden-pm {
        position: fixed;
        top: 0;
        left: -10000px;
        width: 816px;
        height: 1px;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
        user-select: none;
      }

      .xp-docx-editor__hidden-pm .ProseMirror {
        min-height: 1px;
        outline: none;
      }

      .xp-docx-editor .layout-page {
        box-sizing: border-box;
      }

      .xp-docx-editor .layout-page-content,
      .xp-docx-editor .layout-page-header,
      .xp-docx-editor .layout-page-footer {
        user-select: none;
      }

      .xp-docx-editor .layout-page-content {
        cursor: text;
      }

      .xp-docx-editor .layout-page-header,
      .xp-docx-editor .layout-page-footer {
        pointer-events: none;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @keyframes xp-docx-editor-caret-blink {
        0%,
        45% {
          opacity: 1;
        }
        46%,
        100% {
          opacity: 0;
        }
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
  private readonly pagesHost = viewChild.required<ElementRef<HTMLElement>>('pages')
  private readonly selectionOverlay = viewChild.required<ElementRef<HTMLElement>>('selectionOverlay')
  readonly #zone = inject(NgZone)

  readonly #statusMessage = signal('')
  readonly statusMessage = this.#statusMessage.asReadonly()
  #view: EditorView | null = null
  #manager: ExtensionManager | null = null
  #document: Document | null = null
  #preparedBuffer: ArrayBuffer | null = null
  #loadingBuffer: ArrayBuffer | null = null
  #loadRevision = 0
  #scheduler: LayoutScheduler | null = null
  #layoutState: EditorState | null = null
  #layout: ReturnType<typeof computeLayout>['layout'] | null = null
  #blocks: FlowBlock[] = []
  #measures: Measure[] = []
  #dirty = false
  #ready = false
  #destroyed = false
  #renderScheduled = false

  constructor() {
    afterNextRender(() => {
      if (this.#destroyed) {
        return
      }

      this.#ready = true
      this.#scheduler = createLayoutScheduler((state) => this.renderLayout(state))
      void this.prepareEditor()
    })

    effect(() => {
      this.documentBuffer()
      this.fileName()
      this.editable()

      if (!this.#ready || this.#destroyed) {
        return
      }

      const buffer = this.documentBuffer()
      if (buffer !== this.#preparedBuffer && buffer !== this.#loadingBuffer) {
        void this.prepareEditor()
      } else if (this.#view) {
        this.#view.setProps({ editable: () => this.editable() })
        this.scheduleLayout(this.#view.state)
      }
    })
  }

  ngOnDestroy() {
    this.#destroyed = true
    this.#loadRevision++
    this.#scheduler?.cancel()
    this.#scheduler = null
    this.#view?.destroy()
    this.#view = null
    this.#manager?.destroy()
    this.#manager = null
    this.#preparedBuffer = null
    this.#loadingBuffer = null
    this.#document = null
  }

  async save() {
    if (!this.#document || !this.#view || !this.#preparedBuffer) {
      return null
    }

    try {
      const document = updateDocumentContent(this.#document, this.#view.state.doc)
      const buffer = await repackDocx(document)
      return createDocxFile(buffer, this.fileName())
    } catch (error) {
      this.emitError(error)
      return null
    }
  }

  reload() {
    if (!this.#preparedBuffer || !this.#ready) {
      return
    }

    void this.prepareEditor()
  }

  undoEdit() {
    const view = this.#view
    if (view && this.editable()) {
      undo(view.state, view.dispatch)
      view.focus()
    }
  }

  redoEdit() {
    const view = this.#view
    if (view && this.editable()) {
      redo(view.state, view.dispatch)
      view.focus()
    }
  }

  toggleBold() {
    this.toggleMark('bold')
  }

  toggleItalic() {
    this.toggleMark('italic')
  }

  toggleUnderline() {
    this.toggleMark('underline')
  }

  async saveFromToolbar() {
    const file = await this.save()
    if (file) {
      this.emitSaveRequest(file)
    }
  }

  handleViewportMouseDown(event: MouseEvent) {
    if (!this.editable() || !this.#view) {
      return
    }

    const target = event.target as Element | null
    if (!target || !target.closest('.layout-page-content')) {
      return
    }

    const position = clickToPositionDom(this.pagesHost().nativeElement, event.clientX, event.clientY, 1)
    if (position === null) {
      return
    }

    event.preventDefault()
    const doc = this.#view.state.doc
    const resolved = doc.resolve(Math.max(1, Math.min(position, doc.content.size)))
    this.#view.dispatch(this.#view.state.tr.setSelection(TextSelection.near(resolved)).scrollIntoView())
    this.#view.focus()
  }

  private async prepareEditor() {
    const buffer = this.documentBuffer()
    const revision = ++this.#loadRevision

    if (!buffer) {
      this.#loadingBuffer = null
      this.#preparedBuffer = null
      this.#document = null
      this.destroyEditor()
      this.setStatus('No document loaded.')
      return
    }

    this.#loadingBuffer = buffer
    this.setStatus('Loading document...')

    try {
      const document = normalizeDocxTableWidths(await parseDocx(buffer))
      if (this.#destroyed || revision !== this.#loadRevision) {
        return
      }

      this.#loadingBuffer = null
      this.#preparedBuffer = buffer
      this.#document = document
      this.createEditor(document)
      this.setDirty(false)
      this.setStatus('Ready')
    } catch (error) {
      if (this.#destroyed || revision !== this.#loadRevision) {
        return
      }

      this.#loadingBuffer = null
      this.setStatus('Unable to load this document.')
      this.emitError(error)
    }
  }

  private createEditor(document: Document) {
    this.destroyEditor()

    const manager = new ExtensionManager(createStarterKit())
    manager.buildSchema()
    manager.initializeRuntime()
    this.#manager = manager

    const styles = document.package.styles
    const pmDocument = toProseDoc(document, {
      styles,
      defaultTabStopTwips: document.package.settings?.defaultTabStop
    })
    const plugins = [
      ...manager.getPlugins(),
      createDocumentStylesPlugin(styles),
      createDocumentContextPlugin({
        theme: document.package.theme ?? null,
        defaultTableStyleId: document.package.settings?.defaultTableStyle ?? null
      })
    ]
    const initialState = ensureParaIdsInState(
      EditorState.create({
        doc: pmDocument,
        schema: manager.getSchema(),
        plugins
      })
    )

    this.#view = new EditorView(this.editorHost().nativeElement, {
      state: initialState,
      editable: () => this.editable(),
      attributes: {
        style: 'overflow-anchor: none'
      },
      handleScrollToSelection: () => true,
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          void this.saveFromToolbar()
          return true
        }

        return false
      },
      dispatchTransaction: (transaction) => this.dispatchTransaction(transaction)
    })
    this.#view.focus()
    this.scheduleLayout(initialState)
  }

  private destroyEditor() {
    this.#scheduler?.cancel()
    this.#view?.destroy()
    this.#view = null
    this.#manager?.destroy()
    this.#manager = null
    this.#layoutState = null
    this.#layout = null
    this.#blocks = []
    this.#measures = []
    this.pagesHost().nativeElement.replaceChildren()
    this.selectionOverlay().nativeElement.replaceChildren()
  }

  private dispatchTransaction(transaction: Parameters<EditorView['dispatch']>[0]) {
    const view = this.#view
    if (!view || this.#destroyed) {
      return
    }

    stripScrollFlag(transaction, view.state.tr)
    const nextState = view.state.apply(transaction)
    view.updateState(nextState)

    if (transaction.docChanged) {
      this.setDirty(true)
      this.setStatus('Unsaved changes')
      this.scheduleLayout(nextState)
    } else if (transaction.selectionSet) {
      this.updateSelectionOverlay()
    }
  }

  private scheduleLayout(state: EditorState) {
    this.#scheduler?.schedule(state)
  }

  private renderLayout(state: EditorState) {
    if (!this.#document || this.#destroyed) {
      return
    }

    this.#renderScheduled = true
    try {
      const sectionProperties =
        this.#document.package.document.finalSectionProperties ??
        this.#document.package.document.sections?.[0]?.properties
      const finalSectionProperties = this.#document.package.document.finalSectionProperties ?? sectionProperties
      const pageSize = getPageSize(sectionProperties)
      const margins = getMargins(sectionProperties)
      const columns = getColumns(sectionProperties)
      const finalPageSize = getPageSize(finalSectionProperties)
      const finalMargins = getMargins(finalSectionProperties)
      const finalColumns = getColumns(finalSectionProperties)
      const contentWidth = Math.max(1, pageSize.w - margins.left - margins.right)
      const resolvedHeader = resolveHeaderFooter(this.#document, sectionProperties)

      const layoutResult = computeLayout({
        state,
        document: this.#document,
        pageSize,
        margins,
        columns,
        finalPageSize,
        finalMargins,
        finalColumns,
        pageGap: 24,
        contentWidth,
        theme: this.#document.package.theme,
        styles: this.#document.package.styles,
        sectionProperties,
        finalSectionProperties,
        headerContent: resolvedHeader.header,
        footerContent: resolvedHeader.footer,
        firstPageHeaderContent: resolvedHeader.firstHeader,
        firstPageFooterContent: resolvedHeader.firstFooter,
        measureBlocks: (blocks, width, pageGeometry) => this.measureBlocks(blocks, width, pageGeometry),
        getHfPmDoc: () => null
      })

      this.#layoutState = state
      this.#layout = layoutResult.layout
      this.#blocks = layoutResult.blocks
      this.#measures = layoutResult.measures

      const pages = this.pagesHost().nativeElement
      const blockLookup = buildBlockLookup(layoutResult.blocks, layoutResult.measures)
      renderPages(layoutResult.layout.pages, pages, {
        pageGap: 24,
        showShadow: true,
        backgroundColor: 'var(--color-components-card-bg)',
        blockLookup,
        headerContent: layoutResult.headerContentForRender,
        footerContent: layoutResult.footerContentForRender,
        firstPageHeaderContent: layoutResult.firstPageHeaderForRender,
        firstPageFooterContent: layoutResult.firstPageFooterForRender,
        titlePg: layoutResult.hasTitlePg,
        headerDistance: layoutResult.headerDistancePx,
        footerDistance: layoutResult.footerDistancePx,
        pageBorders: layoutResult.pageBorders,
        theme: this.#document.package.theme,
        footnotesByPage: layoutResult.footnotesByPage
      })
      this.#renderScheduled = false
      this.updateSelectionOverlay()
    } catch (error) {
      this.setStatus('Unable to render this document.')
      this.emitError(error)
    } finally {
      this.#renderScheduled = false
    }
  }

  private measureBlocks(
    blocks: FlowBlock[],
    contentWidth: number | number[],
    pageGeometry?: Parameters<typeof measureBlocksWithFloats>[3]
  ): Measure[] {
    return measureBlocksWithFloats(
      blocks,
      contentWidth,
      (block, width, floatingZones, cumulativeY) => this.measureBlock(block, width, floatingZones, cumulativeY),
      pageGeometry
    )
  }

  private measureBlock(
    block: FlowBlock,
    contentWidth: number,
    floatingZones?: FloatingImageZone[],
    cumulativeY?: number
  ): Measure {
    switch (block.kind) {
      case 'paragraph':
        return measureParagraph(block, contentWidth, {
          floatingZones,
          paragraphYOffset: cumulativeY ?? 0
        })
      case 'table':
        return measureTableBlock(block, contentWidth, (cellBlock, cellWidth) => this.measureBlock(cellBlock, cellWidth))
      case 'image':
        return {
          kind: 'image',
          width: block.width ?? 100,
          height: block.height ?? 100
        }
      case 'textBox': {
        const boxMargins = block.margins ?? DEFAULT_TEXTBOX_MARGINS
        const innerWidth = Math.max(1, (block.width ?? DEFAULT_TEXTBOX_WIDTH) - boxMargins.left - boxMargins.right)
        const innerMeasures = block.content.map((paragraph) => measureParagraph(paragraph, innerWidth))
        const height =
          block.height ??
          innerMeasures.reduce((total, measure) => total + measure.totalHeight, 0) + boxMargins.top + boxMargins.bottom
        return {
          kind: 'textBox',
          width: block.width ?? DEFAULT_TEXTBOX_WIDTH,
          height,
          innerMeasures
        }
      }
      case 'pageBreak':
        return { kind: 'pageBreak' }
      case 'columnBreak':
        return { kind: 'columnBreak' }
      case 'sectionBreak':
        return { kind: 'sectionBreak' }
      default:
        return assertExhaustiveFlowBlock(block, 'angular DocxEditor adapter')
    }
  }

  private toggleMark(markName: string) {
    const view = this.#view
    const mark = view?.state.schema.marks[markName]
    if (!view || !mark || !this.editable()) {
      return
    }

    toggleMark(mark)(view.state, view.dispatch)
    view.focus()
  }

  private updateSelectionOverlay() {
    if (!this.#view || !this.#layoutState || !this.#layout || this.#renderScheduled) {
      return
    }

    const pages = this.pagesHost().nativeElement
    const overlay = this.selectionOverlay().nativeElement
    const overlayRect = overlay.getBoundingClientRect()
    overlay.replaceChildren()
    const { from, to } = this.#view.state.selection

    if (from === to) {
      const caret = getCaretPositionFromDom(pages, from, overlayRect, 1)
      if (!caret) {
        return
      }

      const element = document.createElement('div')
      element.className = 'xp-docx-editor__caret'
      element.style.left = `${caret.x}px`
      element.style.top = `${caret.y}px`
      element.style.height = `${Math.max(14, caret.height)}px`
      overlay.appendChild(element)
      return
    }

    const rects = getSelectionRectsFromDom(pages, from, to, overlayRect)
    for (const rect of rects) {
      const element = document.createElement('div')
      element.className = 'xp-docx-editor__selection'
      element.style.left = `${rect.x}px`
      element.style.top = `${rect.y}px`
      element.style.width = `${rect.width}px`
      element.style.height = `${rect.height}px`
      overlay.appendChild(element)
    }
  }

  private setDirty(dirty: boolean) {
    if (this.#dirty === dirty) {
      return
    }

    this.#dirty = dirty
    this.#zone.run(() => this.dirtyChange.emit(dirty))
  }

  private setStatus(message: string) {
    this.#zone.run(() => this.#statusMessage.set(message))
  }

  private emitSaveRequest(file: File) {
    this.#zone.run(() => this.saveRequest.emit(file))
  }

  private emitError(error: unknown) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    this.#zone.run(() => this.editorError.emit(normalized))
  }
}
