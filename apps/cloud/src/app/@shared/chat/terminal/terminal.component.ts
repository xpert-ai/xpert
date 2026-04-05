import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectToastr, SandboxService, TChatMessageStep, TProgramToolMessage } from '../../../@core'
import { omitBlank } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { Subscription } from 'rxjs'

type TerminalMode = 'interactive' | 'replay'
type TerminalLineType = 'input' | 'output' | 'error'

type TerminalLine = {
  type: TerminalLineType
  text: string
}

@Component({
  standalone: true,
  selector: 'xp-chat-shared-terminal',
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex items-center justify-between border-b border-divider-regular px-4 py-3">
        <div class="flex items-center gap-2 text-sm font-medium text-text-primary">
          <i class="ri-terminal-window-line text-base text-text-secondary"></i>
          @if (mode() === 'interactive') {
            <span>{{ 'PAC.Chat.Terminal' | translate: { Default: 'Terminal' } }}</span>
          } @else {
            <span>{{ 'PAC.Chat.TerminalReplay' | translate: { Default: 'Terminal Replay' } }}</span>
          }
        </div>

        @if (mode() === 'interactive' && runtime()) {
          <div class="text-xs text-text-tertiary">{{ runtime() | number: '0.2-2' }}s</div>
        } @else if (mode() === 'replay' && replayStep()?.error) {
          <div class="text-xs font-medium text-text-destructive">
            {{ 'PAC.Chat.Error' | translate: { Default: 'Error' } }}
          </div>
        }
      </div>

      @if (mode() === 'interactive') {
        <div #container class="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-4">
          @if (history().length) {
            <div class="space-y-2">
              @for (line of history(); track $index) {
                @switch (line.type) {
                  @case ('input') {
                    <div class="flex items-start gap-2 text-sm">
                      <span class="shrink-0 font-mono text-text-primary">xpert@sandbox $</span>
                      <span class="min-w-0 whitespace-pre-wrap break-all font-mono text-text-primary">{{ line.text }}</span>
                    </div>
                  }
                  @case ('error') {
                    <div class="whitespace-pre-wrap break-all font-mono text-sm text-text-destructive">{{ line.text }}</div>
                  }
                  @default {
                    <div class="whitespace-pre-wrap break-all font-mono text-sm text-text-secondary">{{ line.text }}</div>
                  }
                }
              }
            </div>
          } @else {
            <div class="flex h-full min-h-[14rem] items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center text-sm text-text-secondary">
              {{
                hasInteractiveContext()
                  ? ('PAC.Chat.TerminalEmpty' | translate: { Default: 'Run a command to inspect the current workspace.' })
                  : ('PAC.Chat.TerminalNoThread'
                    | translate
                      : { Default: 'Start a conversation first, then commands will run in the current workspace.' })
              }}
            </div>
          }
        </div>

        <div class="border-t border-divider-regular px-4 py-3">
          <form class="flex items-center gap-3" (submit)="runCommand($event)">
            <span class="shrink-0 font-mono text-sm text-text-primary">$</span>
            <input
              #textInput
              type="text"
              class="min-w-0 flex-1 bg-transparent font-mono text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              [disabled]="running() || !hasInteractiveContext()"
              [(ngModel)]="currentInput"
              [ngModelOptions]="{ standalone: true }"
              [placeholder]="
                hasInteractiveContext()
                  ? ('PAC.Chat.TerminalPlaceholder' | translate: { Default: 'Type a command...' })
                  : ('PAC.Chat.TerminalDisabledPlaceholder'
                    | translate
                      : { Default: 'Conversation context is required before running commands.' })
              "
            />
            @if (running()) {
              <div class="shrink-0 text-xs text-text-tertiary">
                {{ 'PAC.Chat.Running' | translate: { Default: 'Running…' } }}
              </div>
            }
          </form>
        </div>
      } @else {
        <div #container class="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-4">
          @if (replayStep(); as step) {
            <div class="space-y-4">
              <div>
                <div class="mb-2 text-xs uppercase tracking-[0.2em] text-text-tertiary">
                  {{ 'PAC.Chat.TerminalInput' | translate: { Default: 'Command' } }}
                </div>
                <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                  <div class="flex items-start gap-2 text-sm">
                    <span class="shrink-0 font-mono text-text-primary">xpert@sandbox $</span>
                    <span class="min-w-0 whitespace-pre-wrap break-all font-mono text-text-primary">{{
                      step.data?.code || step.message || ''
                    }}</span>
                  </div>
                </div>
              </div>

              <div>
                <div class="mb-2 text-xs uppercase tracking-[0.2em] text-text-tertiary">
                  {{ 'PAC.Chat.TerminalOutput' | translate: { Default: 'Output' } }}
                </div>
                <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                  @if (step.data?.output) {
                    <div class="whitespace-pre-wrap break-all font-mono text-sm text-text-secondary">
                      {{ step.data?.output }}
                    </div>
                  } @else {
                    <div class="text-sm text-text-tertiary">
                      {{ 'PAC.Chat.TerminalNoOutput' | translate: { Default: 'No output was captured for this run.' } }}
                    </div>
                  }
                </div>
              </div>

              @if (step.error) {
                <div>
                  <div class="mb-2 text-xs uppercase tracking-[0.2em] text-text-destructive">
                    {{ 'PAC.Chat.Error' | translate: { Default: 'Error' } }}
                  </div>
                  <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3 font-mono text-sm text-text-destructive">
                    {{ step.error }}
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="flex h-full min-h-[14rem] items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center text-sm text-text-secondary">
              {{
                'PAC.Chat.TerminalReplayEmpty'
                  | translate
                    : {
                        Default: 'Select a bash tool result first, then this panel can replay the captured command and output.'
                      }
              }}
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0'
  }
})
export class ChatSharedTerminalComponent {
  readonly #sandboxService = inject(SandboxService)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)

  readonly mode = input<TerminalMode>('interactive')
  readonly conversationId = input<string | null | undefined>(null)
  readonly projectId = input<string | null | undefined>(null)
  readonly replayStep = input<TChatMessageStep<TProgramToolMessage> | null>(null)

  readonly container = viewChild('container', { read: ElementRef })
  readonly textInput = viewChild('textInput', { read: ElementRef })

  readonly currentInput = model('')
  readonly history = signal<TerminalLine[]>([])
  readonly running = signal(false)
  readonly runtime = signal(0)
  readonly hasInteractiveContext = computed(() => !!this.conversationId()?.trim())

  #commandSubscription: Subscription | null = null
  #startTime = 0

  constructor() {
    afterNextRender(() => {
      this.focusInput()
    })

    effect(() => {
      this.mode()
      this.history()
      this.replayStep()

      queueMicrotask(() => {
        const container = this.container()?.nativeElement as HTMLElement | undefined
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    })

    effect(
      () => {
        if (this.mode() !== 'interactive') {
          return
        }

        this.conversationId()
        this.projectId()
        this.#commandSubscription?.unsubscribe()
        this.#commandSubscription = null
        this.history.set([])
        this.currentInput.set('')
        this.running.set(false)
        this.runtime.set(0)
      },
      { allowSignalWrites: true }
    )

    this.#destroyRef.onDestroy(() => {
      this.#commandSubscription?.unsubscribe()
    })
  }

  runCommand(event: Event) {
    event.preventDefault()

    if (this.mode() !== 'interactive' || !this.hasInteractiveContext() || this.running()) {
      return
    }

    const command = this.currentInput().trim()
    if (!command) {
      return
    }

    this.history.update((history) => [...history, { type: 'input', text: command }])
    this.currentInput.set('')
    this.running.set(true)
    this.runtime.set(0)
    this.#startTime = Date.now()
    this.#commandSubscription?.unsubscribe()

    this.#commandSubscription = this.#sandboxService
      .terminal(
        { cmd: command },
        omitBlank({
          projectId: this.projectId(),
          conversationId: this.conversationId()
        }) as { projectId?: string | null; conversationId: string }
      )
      .subscribe({
        next: (message) => {
          this.runtime.set((Date.now() - this.#startTime) / 1000)

          if (message.event === 'error') {
            this.pushLine('error', message.data)
            this.#toastr.error(message.data)
            this.finishCommand()
            return
          }

          if (message.data?.startsWith(':')) {
            return
          }

          this.pushLine('output', message.data)
        },
        error: (error) => {
          const message = getErrorMessage(error)
          this.pushLine('error', message)
          this.#toastr.error(message)
          this.finishCommand()
        },
        complete: () => {
          this.finishCommand()
        }
      })
  }

  private pushLine(type: TerminalLineType, text?: string | null) {
    if (!text) {
      return
    }

    this.history.update((history) => [...history, { type, text }])
  }

  private finishCommand() {
    this.#commandSubscription = null
    this.running.set(false)
    this.focusInput()
  }

  private focusInput() {
    if (this.mode() !== 'interactive' || !this.hasInteractiveContext()) {
      return
    }

    const input = this.textInput()?.nativeElement as HTMLInputElement | undefined
    if (!input) {
      return
    }

    setTimeout(() => {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }
}
