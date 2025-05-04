import { Clipboard } from '@angular/cdk/clipboard'
import { Overlay } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  model,
  output,
  signal,
  ViewChild,
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { effectAction } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { timer } from 'rxjs'
import { switchMap, tap } from 'rxjs/operators'
import { agentLabel } from '../../../@core'

declare var monaco: any

@Component({
  selector: 'copilot-instruction-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MonacoEditorModule,
    MatTooltipModule,
  ],
})
export class CopilotInstructionEditorComponent {
  agentLabel = agentLabel

  readonly #clipboard = inject(Clipboard)
  readonly elementRef = inject(ElementRef)

  // Inputs
  readonly instruction = model<string>()
  readonly initHeight = input<number | string>(210)
  readonly tooltip = input<string>()

  // Outputs
  readonly deleted = output<void>()

  // Children
  @ViewChild('editablePrompt', { static: true }) editablePrompt!: ElementRef

  // States
  readonly promptLength = computed(() => this.instruction()?.length)

  height = this.initHeight()
  private isResizing = false
  private startY = 0
  private startHeight: string | number = 0
  readonly copied = signal(false)

  readonly editorOptions = signal({
    theme: 'vs',
    automaticLayout: true,
    language: 'markdown',
    lineNumbers: 'off',
    glyphMargin: 0,
    wordWrap: false,
    minimap: {
      enabled: false
    }
  })

  readonly #editor = signal(null)

  constructor() {
    // effect(() => {
    //   if (this.initHeight()) {
    //     this.height = this.initHeight()
    //   }
    // })

    effect(() => {
      const height = this.elementRef.nativeElement.offsetHeight
      this.startHeight = height
    }, { allowSignalWrites: true })
  }

  toggleWrap() {
    this.editorOptions.update((state) => ({ ...state, wordWrap: !state.wordWrap }))
  }

  remove() {
    this.instruction.set(null)
    this.deleted.emit()
  }

  copy = effectAction((origin$) =>
    origin$.pipe(
      tap(() => {
        this.#clipboard.copy(this.instruction())
        this.copied.set(true)
      }),
      switchMap(() => timer(3000)),
      tap(() => this.copied.set(false))
    )
  )

  // Editor
  onInit(editor: any) {
    this.#editor.set(editor)
  }

  onResized() {
    this.#editor()?.layout()
  }

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
      // this.height = this.startHeight + offset
      // if (this.height < 50) this.height = 50 // Set minimum height

      this.onResized()
      event.preventDefault()
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isResizing = false
  }
}
