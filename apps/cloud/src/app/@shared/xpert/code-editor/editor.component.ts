import { Clipboard } from '@angular/cdk/clipboard'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Overlay, OverlayRef } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  model,
  numberAttribute,
  output,
  signal,
  TemplateRef,
  viewChild,
  ViewChild,
  ViewContainerRef
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { effectAction } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { timer } from 'rxjs'
import { switchMap, tap } from 'rxjs/operators'
import { agentLabel, TWorkflowVarGroup } from '../../../@core'

declare var monaco: any

@Component({
  selector: 'xpert-workflow-code-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CdkMenuModule, FormsModule, TranslateModule, MonacoEditorModule, MatTooltipModule],
  host: {
    '[class.fullscreen]': 'fullscreen()'
  }
})
export class XpertWorkflowCodeEditorComponent {
  agentLabel = agentLabel

  readonly #clipboard = inject(Clipboard)
  readonly #vcr = inject(ViewContainerRef)
  readonly elementRef = inject(ElementRef)

  readonly regex = `{{(.*?)}}`

  // Inputs
  readonly language = model<string>('javascript')
  readonly code = model<string>()
  readonly initHeight = input<number, number | string>(210, {
    transform: numberAttribute
  })
  readonly tooltip = input<string>()
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly role = input<'system' | 'ai' | 'human'>()
  readonly fullscreen = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly deleted = output<void>()

  // Children
  @ViewChild('editablePrompt', { static: true }) editablePrompt!: ElementRef
  @ViewChild('suggestionsTemplate', { static: true }) suggestionsTemplate!: TemplateRef<any>
  readonly suggestionsMenu = viewChild('suggestions', { read: ElementRef })
  overlayRef: OverlayRef | null = null

  // States
  readonly codeLength = computed(() => this.code()?.length)

  height = this.initHeight()
  private isResizing = false
  private startY = 0
  private startHeight = 0
  readonly copied = signal(false)

  readonly wordWrap = signal(false)

  readonly editorOptions = computed(() => ({
    theme: 'vs',
    automaticLayout: true,
    language: this.language(),
    glyphMargin: 0,
    wordWrap: this.wordWrap(),
    minimap: {
      enabled: false
    }
  }))

  readonly #editor = signal(null)

  constructor(private overlay: Overlay) {
    effect(() => {
      if (this.initHeight()) {
        this.height = this.initHeight()
      }
    })
  }

  toggleWrap() {
    this.wordWrap.update((state) => !state)
  }

  generate() {
    // this.#dialog
    //   .open(CopilotPromptGeneratorComponent, {
    //     panelClass: 'large'
    //   })
    //   .afterClosed()
    //   .subscribe({
    //     next: (result) => {
    //       if (result) {
    //         this.prompt.set(result)
    //       }
    //     }
    //   })
  }

  remove() {
    this.code.set(null)
    this.deleted.emit()
  }

  copy = effectAction((origin$) =>
    origin$.pipe(
      tap(() => {
        this.#clipboard.copy(this.code())
        this.copied.set(true)
      }),
      switchMap(() => timer(3000)),
      tap(() => this.copied.set(false))
    )
  )

  onMouseDown(event: MouseEvent): void {
    this.isResizing = true
    this.startY = event.clientY
    this.startHeight = this.height
    event.preventDefault()
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isResizing) {
      const offset = event.clientY - this.startY
      this.height = this.startHeight + offset
      if (this.height < 50) this.height = 50 // Set minimum height

      this.onResized()
      event.preventDefault()
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isResizing = false
  }

  // Editor
  onInit(editor: any) {
    this.#editor.set(editor)
  }

  onResized() {
    this.#editor()?.layout()
  }

  getPosition() {
    return this.#editor().getPosition()
  }

  getCursorPagePosition() {
    const editor = this.#editor()
    // Get the cursor position
    const position = editor.getPosition()

    // Get the cursor coordinates within the editor content
    const cursorCoords = editor.getScrolledVisiblePosition(position)

    // Get the editor DOM element and content container
    const editorDom = editor.getDomNode()
    const viewLines = editorDom.querySelector('.view-lines')

    // Check if viewLines exists
    const rect = viewLines ? viewLines.getBoundingClientRect() : editorDom.getBoundingClientRect()

    // Calculate the absolute coordinates of the cursor on the page
    const cursorX = rect.left + cursorCoords.left
    const cursorY = rect.top + cursorCoords.top

    return { x: cursorX, y: cursorY }
  }

  setLanguage(language: 'javascript' | 'python') {
    this.language.set(language)
  }
}
