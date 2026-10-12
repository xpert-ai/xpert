import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, OnInit, signal } from '@angular/core'
import { getErrorMessage } from '@cloud/app/@core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpDialogFrameImports, XpSpinComponent, ZardButtonComponent } from '@xpert-ai/headless-ui'

type RestartProgressDialogData = {
  run: () => Promise<unknown>
  onRecovered: () => void
}

@Component({
  standalone: true,
  selector: 'xp-plugin-runtime-restart-progress',
  imports: [TranslateModule, XpSpinComponent, ZardButtonComponent, ...XpDialogFrameImports],
  template: `
    <div xpDialogLayout="standard" class="w-full max-h-[calc(100dvh-32px)]">
      <header xpDialogHeader class="flex-row items-start gap-4">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background-default-subtle text-text-accent"
        >
          @if (state() === 'recovered') {
            <i class="ri-checkbox-circle-line text-xl"></i>
          } @else if (state() === 'error') {
            <i class="ri-error-warning-line text-xl text-text-destructive"></i>
          } @else {
            <xp-spin small />
          }
        </div>
        <div class="min-w-0">
          <h2 xpDialogHeading>
            @switch (state()) {
              @case ('starting') {
                {{ 'XP.Plugin.RestartingTitle' | translate: { Default: 'Restarting API service' } }}
              }
              @case ('waiting') {
                {{ 'XP.Plugin.RestartWaitingTitle' | translate: { Default: 'Waiting for API service' } }}
              }
              @case ('recovered') {
                {{ 'XP.Plugin.RestartRecoveredTitle' | translate: { Default: 'API service is ready' } }}
              }
              @case ('error') {
                {{ 'XP.Plugin.RestartFailedTitle' | translate: { Default: 'Restart could not be completed' } }}
              }
            }
          </h2>
          <p xpDialogDescription class="mt-2">
            @switch (state()) {
              @case ('starting') {
                {{
                  'XP.Plugin.RestartingDescription'
                    | translate: { Default: 'The server is draining active requests before restarting.' }
                }}
              }
              @case ('waiting') {
                {{
                  'XP.Plugin.RestartWaitingDescription'
                    | translate
                      : { Default: 'The connection may be unavailable briefly. This page will recover automatically.' }
                }}
              }
              @case ('recovered') {
                {{
                  'XP.Plugin.RestartRecoveredDescription'
                    | translate: { Default: 'Plugin changes are active. Reloading this page now.' }
                }}
              }
              @case ('error') {
                {{ error() }}
              }
            }
          </p>
        </div>
      </header>

      @if (state() === 'starting' || state() === 'waiting') {
        <div xpDialogBody>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full w-1/2 animate-pulse rounded-full bg-primary"></div>
          </div>
        </div>
      }

      @if (state() === 'error') {
        <footer xpDialogFooter>
          <button type="button" z-button zType="outline" (click)="close()">
            {{ 'XP.Plugin.RestartLater' | translate: { Default: 'Later' } }}
          </button>
          <button type="button" z-button (click)="retry()">
            <i class="ri-refresh-line"></i>
            {{ 'XP.Plugin.RestartRetry' | translate: { Default: 'Try again' } }}
          </button>
        </footer>
      }
    </div>
  `
})
export class PluginRuntimeRestartProgressComponent implements OnInit {
  readonly #dialogRef = inject<DialogRef<void>>(DialogRef)
  readonly #data = inject<RestartProgressDialogData>(DIALOG_DATA)
  readonly #translate = inject(TranslateService)

  readonly state = signal<'starting' | 'waiting' | 'recovered' | 'error'>('starting')
  readonly error = signal('')

  ngOnInit() {
    void this.run()
  }

  retry() {
    void this.run()
  }

  close() {
    this.#dialogRef.close()
  }

  private async run() {
    this.state.set('starting')
    this.error.set('')
    try {
      const promise = this.#data.run()
      this.state.set('waiting')
      await promise
      this.state.set('recovered')
      this.#data.onRecovered()
      setTimeout(() => window.location.reload(), 600)
    } catch (error) {
      this.error.set(this.describeError(error))
      this.state.set('error')
    }
  }

  private describeError(error: unknown) {
    const errorCode = readErrorCode(error)
    const localizedErrors: Record<string, { key: string; fallback: string }> = {
      RUNTIME_RESTART_SUPER_ADMIN_REQUIRED: {
        key: 'XP.Plugin.RestartAdminRequired',
        fallback: 'Ask a SuperAdmin in the default tenant scope to restart the API service.'
      },
      RUNTIME_RESTART_DEFAULT_TENANT_REQUIRED: {
        key: 'XP.Plugin.RestartDefaultTenantRequired',
        fallback: 'The API service can only be restarted from the default tenant.'
      },
      RUNTIME_RESTART_INTERACTIVE_AUTH_REQUIRED: {
        key: 'XP.Plugin.RestartInteractiveSessionRequired',
        fallback: 'Sign in with an interactive SuperAdmin session before restarting the API service.'
      },
      RUNTIME_RESTART_COORDINATION_UNAVAILABLE: {
        key: 'XP.Plugin.RestartCoordinationUnavailable',
        fallback: 'Restart coordination is temporarily unavailable. Try again shortly.'
      },
      RUNTIME_RESTART_IN_PROGRESS: {
        key: 'XP.Plugin.RestartAlreadyInProgress',
        fallback: 'Another API restart is already in progress. Wait for the service to recover.'
      }
    }
    const localized = errorCode ? localizedErrors[errorCode] : undefined
    if (localized) {
      return this.#translate.instant(localized.key, { Default: localized.fallback }) as string
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return this.#translate.instant('XP.Plugin.RestartTimeout', {
        Default: 'The API service did not recover within two minutes. Check the server process and try again.'
      }) as string
    }
    return getErrorMessage(error)
  }
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return null
  }
  const direct = Reflect.get(error, 'errorCode')
  if (typeof direct === 'string') {
    return direct
  }
  const response = Reflect.get(error, 'error')
  if (!response || typeof response !== 'object') {
    return null
  }
  const nested = Reflect.get(response, 'errorCode')
  return typeof nested === 'string' ? nested : null
}
