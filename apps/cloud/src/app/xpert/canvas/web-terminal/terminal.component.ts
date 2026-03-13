import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { getErrorMessage, injectToastr, SandboxService } from '@cloud/app/@core'
import { omitBlank } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
interface TerminalLine {
  type: 'input' | 'output'
  text: string
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    ...ZardTooltipImports
  ],
  selector: 'chat-canvas-web-terminal',
  templateUrl: './terminal.component.html',
  styleUrl: 'terminal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasWebTerminalComponent {
  readonly #sandboxAPI = inject(SandboxService)
  readonly #toastr = injectToastr()

  readonly projectId = input<string>()
  readonly conversationId = input<string>()

  // Children
  readonly container = viewChild('container', { read: ElementRef })
  readonly textInput = viewChild('textInput', { read: ElementRef })

  history = signal<TerminalLine[]>([{ type: 'output', text: 'Welcome to Sandbox Terminal' }])
  currentInput = model<string>('')

  readonly running = signal(false)
  readonly runtime = signal(0)
  private startTime: number

  constructor() {
    afterNextRender(() => {
      this.focusInput()
    })
  }

  runCommand(event: Event): void {
    if ((<KeyboardEvent>event).isComposing) {
      return
    }

    const command = this.currentInput().trim()
    if (!command) return

    // Append input to history
    this.history.update((h) => [...h, { type: 'input', text: command }])
    this.currentInput.set('')
    this.running.set(true)
    this.startTime = Date.now()
    this.runtime.set(0)

    this.#sandboxAPI
      .terminal({ cmd: command }, omitBlank({ projectId: this.projectId(), conversationId: this.conversationId() }))
      .subscribe({
        next: (msg) => {
          this.runtime.set((Date.now() - this.startTime) / 1000)
          if (msg.event === 'error') {
            this.#toastr.error(msg.data)
            this.running.set(false)
            this.focusInput()
          } else {
            if (msg.data) {
              // Ignore non-data events
              if (msg.data.startsWith(':')) {
                return
              }
              this.history.update((h) => [...h, { type: 'output', text: msg.data }])
            }
          }
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
          this.running.set(false)
          this.container().nativeElement.scrollTop = this.container().nativeElement.scrollHeight
          this.focusInput()
        },
        complete: () => {
          this.running.set(false)
          this.container().nativeElement.scrollTop = this.container().nativeElement.scrollHeight
          this.focusInput()
        }
      })
  }

  focusInput(): void {
    const input = this.textInput()?.nativeElement
    if (input) {
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      })
    }
  }
}
