import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, ITerminalOptions, ITheme } from '@xterm/xterm'
import { TranslateModule } from '@ngx-translate/core'
import { Subscription } from 'rxjs'
import {
  SandboxTerminalClosedReason,
  SandboxTerminalErrorCode,
  SandboxTerminalServerEvent,
  SandboxTerminalSocketService,
  getErrorMessage,
  injectToastr,
  uuid
} from '../../../@core'
import type { SandboxTerminalServerMessage, TChatMessageStep, TProgramToolMessage } from '../../../@core'

type TerminalMode = 'interactive' | 'replay'
type TerminalStatus = 'closed' | 'connected' | 'connecting' | 'disconnected' | 'error' | 'idle' | 'unsupported'

const DEFAULT_TERMINAL_COLS = 120
const DEFAULT_TERMINAL_ROWS = 32
const TERMINAL_EMPTY_OUTPUT = 'No output was captured for this run.'

@Component({
  standalone: true,
  selector: 'xp-chat-shared-terminal',
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex items-center justify-between border-b border-divider-regular px-4 py-2">
        <div class="flex items-center gap-2 text-sm font-medium text-text-primary">
          <i class="ri-terminal-window-line text-base text-text-secondary"></i>
          @if (mode() === 'interactive') {
            <span>{{ 'PAC.Chat.Terminal' | translate: { Default: 'Terminal' } }}</span>
          } @else {
            <span>{{ 'PAC.Chat.TerminalReplay' | translate: { Default: 'Terminal Replay' } }}</span>
          }
        </div>

        @if (mode() === 'interactive') {
          <span class="rounded-full border border-divider-regular px-2 py-0.5 text-xs font-medium" [class]="statusClasses()">
            {{ statusLabel() | translate: { Default: statusLabelDefault() } }}
          </span>
        } @else if (replayStep()?.error) {
          <div class="text-xs font-medium text-text-destructive">
            {{ 'PAC.Chat.Error' | translate: { Default: 'Error' } }}
          </div>
        }
      </div>

      @if (mode() === 'interactive') {
        @if (hasInteractiveContext()) {
          <div class="flex h-full min-h-[14rem] overflow-hidden bg-(--background) p-3">
            <div #terminalHost class="h-full min-h-0 w-full"></div>
          </div>
        } @else {
          <div class="flex h-full min-h-[14rem] items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center text-sm text-text-secondary">
            {{
              'PAC.Chat.TerminalNoThread'
                | translate
                  : { Default: 'Start a conversation first, then commands will run in the current workspace.' }
            }}
          </div>
        }
      } @else if (replayStep()) {
        <div class="flex h-full min-h-[14rem] overflow-hidden rounded-2xl border border-divider-regular bg-(--background) p-3">
          <div #terminalHost class="h-full min-h-0 w-full"></div>
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

      @if (mode() === 'interactive' && statusMessage()) {
        <div class="border-t border-divider-regular px-4 py-2 text-xs text-text-secondary">
          {{ statusMessage() }}
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
  readonly #destroyRef = inject(DestroyRef)
  readonly #injector = inject(Injector)
  readonly #sandboxTerminalSocketService = inject(SandboxTerminalSocketService)
  readonly #toastr = injectToastr()

  readonly mode = input<TerminalMode>('interactive')
  readonly conversationId = input<string | null | undefined>(null)
  readonly projectId = input<string | null | undefined>(null)
  readonly replayStep = input<TChatMessageStep<TProgramToolMessage> | null>(null)

  readonly terminalHost = viewChild('terminalHost', { read: ElementRef })

  readonly hasInteractiveContext = computed(() => !!this.conversationId()?.trim())
  readonly status = signal<TerminalStatus>('idle')
  readonly statusMessage = signal<string | null>(null)
  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'connected':
        return 'PAC.Chat.TerminalConnected'
      case 'connecting':
        return 'PAC.Chat.TerminalConnecting'
      case 'disconnected':
        return 'PAC.Chat.TerminalDisconnected'
      case 'unsupported':
        return 'PAC.Chat.TerminalUnsupportedProvider'
      case 'error':
        return 'PAC.Chat.TerminalOpenFailed'
      case 'closed':
        return 'PAC.Chat.TerminalSessionClosed'
      default:
        return 'PAC.Chat.TerminalIdle'
    }
  })
  readonly statusLabelDefault = computed(() => {
    switch (this.status()) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting'
      case 'disconnected':
        return 'Disconnected'
      case 'unsupported':
        return 'Unsupported provider'
      case 'error':
        return 'Open failed'
      case 'closed':
        return 'Session closed'
      default:
        return 'Idle'
    }
  })
  readonly statusClasses = computed(() => {
    switch (this.status()) {
      case 'connected':
        return 'text-text-secondary'
      case 'connecting':
        return 'text-text-primary'
      case 'disconnected':
        return 'text-text-tertiary'
      case 'unsupported':
      case 'error':
        return 'text-text-destructive'
      case 'closed':
        return 'text-text-secondary'
      default:
        return 'text-text-tertiary'
    }
  })

  #fitAddon: FitAddon | null = null
  #messageSubscription: Subscription | null = null
  #resizeObserver: ResizeObserver | null = null
  #sessionId: string | null = null
  #socketSubscription: Subscription | null = null
  #terminal: Terminal | null = null
  #terminalOpenRequestId: string | null = null

  constructor() {
    afterNextRender(() => {
      effect(
        (onCleanup) => {
          const host = this.terminalHost()?.nativeElement
          const mode = this.mode()
          const conversationId = this.conversationId()?.trim() ?? null
          const projectId = this.projectId() ?? null
          const replayStep = this.replayStep()

          this.destroyTerminalSession()

          if (!host) {
            this.status.set(mode === 'interactive' ? 'idle' : 'closed')
            this.statusMessage.set(null)
            return
          }

          if (mode === 'interactive') {
            if (!conversationId) {
              this.status.set('idle')
              this.statusMessage.set(null)
              return
            }

            this.setupInteractiveTerminal(host, conversationId, projectId)
          } else {
            this.setupReplayTerminal(host, replayStep)
          }

        onCleanup(() => {
          this.destroyTerminalSession()
        })
      },
      {
        allowSignalWrites: true,
        injector: this.#injector
      }
      )
    })

    this.#destroyRef.onDestroy(() => {
      this.destroyTerminalSession()
    })
  }

  private createTerminal(host: HTMLElement, options: Pick<ITerminalOptions, 'disableStdin'>) {
    host.replaceChildren()

    const terminal = new Terminal({
      cursorBlink: !options.disableStdin,
      disableStdin: options.disableStdin,
      fontFamily: 'var(--font-xp-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace)',
      fontSize: 13,
      scrollback: 4000,
      theme: this.resolveTerminalTheme()
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    fitAddon.fit()

    this.#terminal = terminal
    this.#fitAddon = fitAddon
  }

  private destroyTerminalSession() {
    this.closeInteractiveSession(true)
    this.#messageSubscription?.unsubscribe()
    this.#messageSubscription = null
    this.#socketSubscription?.unsubscribe()
    this.#socketSubscription = null
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#fitAddon = null
    this.#terminal?.dispose()
    this.#terminal = null
    this.#sessionId = null
    this.#terminalOpenRequestId = null
  }

  private setupInteractiveTerminal(host: HTMLElement, conversationId: string, projectId: string | null) {
    this.createTerminal(host, { disableStdin: true })
    this.installResizeObserver(host)
    this.bindInteractiveData()

    this.#messageSubscription = this.#sandboxTerminalSocketService.onMessage().subscribe({
      next: (message) => this.handleInteractiveMessage(message)
    })
    this.#socketSubscription = new Subscription()
    this.#socketSubscription.add(
      this.#sandboxTerminalSocketService.connected$.subscribe((connected) => {
        if (connected) {
          this.requestOpenSession(conversationId, projectId)
        }
      })
    )
    this.#socketSubscription.add(
      this.#sandboxTerminalSocketService.disconnected$.subscribe((disconnected) => {
        if (!disconnected || this.mode() !== 'interactive') {
          return
        }

        this.#sessionId = null
        this.#terminalOpenRequestId = null
        this.setTerminalInteractivity(false)
        this.status.set('disconnected')
        this.statusMessage.set('Terminal connection lost. Reconnecting will start a new session.')
      })
    )

    this.status.set('connecting')
    this.statusMessage.set(null)
    this.#sandboxTerminalSocketService.connect()
  }

  private setupReplayTerminal(host: HTMLElement, replayStep: TChatMessageStep<TProgramToolMessage> | null) {
    this.createTerminal(host, { disableStdin: true })
    this.installResizeObserver(host)

    if (!replayStep || !this.#terminal) {
      return
    }

    const code = replayStep.data?.code || replayStep.message || ''
    if (code) {
      this.#terminal.write(`xpert@sandbox $ ${this.normalizeTerminalText(code)}\r\n`)
    }

    const output = replayStep.data?.output || ''
    if (output) {
      this.#terminal.write(this.normalizeTerminalText(output))
      if (!output.endsWith('\n') && !output.endsWith('\r')) {
        this.#terminal.write('\r\n')
      }
    } else {
      this.#terminal.write(`${TERMINAL_EMPTY_OUTPUT}\r\n`)
    }

    if (replayStep.error) {
      this.#terminal.write(`\r\n[error]\r\n${this.normalizeTerminalText(replayStep.error)}`)
      if (!replayStep.error.endsWith('\n') && !replayStep.error.endsWith('\r')) {
        this.#terminal.write('\r\n')
      }
    }
  }

  private bindInteractiveData() {
    if (!this.#terminal) {
      return
    }

    this.#terminal.onData((data) => {
      if (!this.#sessionId) {
        return
      }

      this.#sandboxTerminalSocketService.input({
        data,
        sessionId: this.#sessionId
      })
    })
  }

  private requestOpenSession(conversationId: string, projectId: string | null) {
    const terminal = this.#terminal
    if (!terminal) {
      return
    }

    this.#terminalOpenRequestId = uuid()
    this.#sessionId = null
    this.setTerminalInteractivity(false)
    this.status.set('connecting')
    this.statusMessage.set(null)
    this.fitTerminal()

    this.#sandboxTerminalSocketService.open({
      cols: terminal.cols || DEFAULT_TERMINAL_COLS,
      conversationId,
      projectId,
      requestId: this.#terminalOpenRequestId,
      rows: terminal.rows || DEFAULT_TERMINAL_ROWS
    })
  }

  private handleInteractiveMessage(message: SandboxTerminalServerMessage) {
    switch (message.event) {
      case SandboxTerminalServerEvent.Opened: {
        if (message.data.requestId !== this.#terminalOpenRequestId) {
          return
        }

        this.#terminalOpenRequestId = null
        this.#sessionId = message.data.sessionId
        this.setTerminalInteractivity(true)
        this.status.set('connected')
        this.statusMessage.set(null)
        this.sendResize()
        this.#terminal?.focus()
        return
      }
      case SandboxTerminalServerEvent.Output: {
        if (message.data.sessionId !== this.#sessionId) {
          return
        }

        this.#terminal?.write(message.data.data)
        return
      }
      case SandboxTerminalServerEvent.Exit: {
        if (message.data.sessionId !== this.#sessionId) {
          return
        }

        this.#terminal?.writeln('')
        this.#terminal?.writeln(
          `[session exited${message.data.exitCode === null ? '' : ` with code ${message.data.exitCode}`}]`
        )
        this.setTerminalInteractivity(false)
        this.status.set('closed')
        this.statusMessage.set('Terminal session closed.')
        return
      }
      case SandboxTerminalServerEvent.Error: {
        if (!this.matchesMessage(message.data.requestId, message.data.sessionId)) {
          return
        }

        const nextStatus =
          message.data.code === SandboxTerminalErrorCode.UnsupportedProvider ? 'unsupported' : 'error'
        this.#terminalOpenRequestId = null
        this.#sessionId = message.data.sessionId ?? null
        this.setTerminalInteractivity(false)
        this.status.set(nextStatus)
        this.statusMessage.set(message.data.message)
        this.#terminal?.writeln('')
        this.#terminal?.writeln(`[${message.data.message}]`)
        this.#toastr.error(message.data.message)
        return
      }
      case SandboxTerminalServerEvent.Closed: {
        if (!this.matchesMessage(message.data.requestId, message.data.sessionId)) {
          return
        }

        this.#terminalOpenRequestId = null
        this.#sessionId = null
        this.setTerminalInteractivity(false)

        switch (message.data.reason) {
          case SandboxTerminalClosedReason.UnsupportedProvider:
            this.status.set('unsupported')
            this.statusMessage.set('The current sandbox provider does not support terminal sessions.')
            break
          case SandboxTerminalClosedReason.OpenFailed:
            this.status.set('error')
            this.statusMessage.set('Failed to open the terminal session.')
            break
          case SandboxTerminalClosedReason.ProcessExited:
          case SandboxTerminalClosedReason.ClientClosed:
            this.status.set('closed')
            this.statusMessage.set('Terminal session closed.')
            break
          case SandboxTerminalClosedReason.SocketDisconnected:
            this.status.set('disconnected')
            this.statusMessage.set('Terminal connection lost. Reconnecting will start a new session.')
            break
          default:
            this.status.set('error')
            this.statusMessage.set('Terminal session closed because of an unexpected error.')
            break
        }
        return
      }
    }
  }

  private closeInteractiveSession(notifyServer: boolean) {
    if (notifyServer && this.#sessionId) {
      this.#sandboxTerminalSocketService.close({
        sessionId: this.#sessionId
      })
    }
  }

  private installResizeObserver(host: HTMLElement) {
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    this.#resizeObserver = new ResizeObserver(() => {
      this.fitTerminal()
      this.sendResize()
    })
    this.#resizeObserver.observe(host)
  }

  private sendResize() {
    if (!this.#terminal || !this.#sessionId) {
      return
    }

    this.#sandboxTerminalSocketService.resize({
      cols: this.#terminal.cols || DEFAULT_TERMINAL_COLS,
      rows: this.#terminal.rows || DEFAULT_TERMINAL_ROWS,
      sessionId: this.#sessionId
    })
  }

  private fitTerminal() {
    try {
      this.#fitAddon?.fit()
    } catch (error) {
      this.statusMessage.set(getErrorMessage(error))
    }
  }

  private setTerminalInteractivity(enabled: boolean) {
    if (!this.#terminal) {
      return
    }

    this.#terminal.options.disableStdin = !enabled
    this.#terminal.options.cursorBlink = enabled
  }

  private resolveTerminalTheme(): ITheme {
    const styles = typeof window === 'undefined' ? null : window.getComputedStyle(document.documentElement)
    const getThemeValue = (...variables: string[]) => {
      for (const variable of variables) {
        const value = styles?.getPropertyValue(variable).trim()
        if (value) {
          return value
        }
      }

      return undefined
    }

    const background = getThemeValue('--background', '--color-components-card-bg')
    const foreground = getThemeValue('--foreground', '--color-text-primary')
    const border = getThemeValue('--color-divider-regular', '--color-divider-deep')
    const muted = getThemeValue('--muted-foreground', '--color-text-secondary')
    const subtle = getThemeValue('--color-text-tertiary', '--color-text-secondary')
    const primary = getThemeValue('--primary', '--ring')
    const success = getThemeValue('--color-text-success')
    const warning = getThemeValue('--color-text-warning', '--color-text-accent')
    const destructive = getThemeValue('--color-text-destructive')
    const accent = getThemeValue('--color-text-accent', '--color-text-accent-secondary', '--ring')

    return {
      background: background || undefined,
      black: subtle,
      blue: primary,
      brightBlack: muted,
      brightBlue: primary,
      brightCyan: primary,
      brightGreen: success,
      brightMagenta: accent,
      brightRed: destructive,
      brightWhite: foreground,
      brightYellow: warning,
      cyan: primary,
      cursor: foreground || undefined,
      cursorAccent: background || undefined,
      foreground: foreground || undefined,
      green: success,
      magenta: accent,
      red: destructive,
      selectionBackground: border || foreground || undefined,
      white: foreground,
      yellow: warning
    }
  }

  private normalizeTerminalText(value: string): string {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
  }

  private matchesMessage(requestId?: string, sessionId?: string): boolean {
    if (requestId && requestId === this.#terminalOpenRequestId) {
      return true
    }

    return !!sessionId && sessionId === this.#sessionId
  }
}
