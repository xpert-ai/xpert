import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, OnInit, signal } from '@angular/core'
import { getErrorMessage } from '@cloud/app/@core'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'

type RestartProgressDialogData = {
  run: () => Promise<unknown>
  onRecovered: () => void
}

@Component({
  standalone: true,
  selector: 'xp-plugin-runtime-restart-progress',
  imports: [TranslateModule, NgmSpinComponent],
  template: `
    <div class="flex flex-col gap-5 p-6">
      <div class="flex items-start gap-4">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background-default-subtle text-text-accent"
        >
          @if (state() === 'recovered') {
            <i class="ri-checkbox-circle-line text-xl"></i>
          } @else if (state() === 'error') {
            <i class="ri-error-warning-line text-xl text-text-destructive"></i>
          } @else {
            <ngm-spin small />
          }
        </div>
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-text-primary">
            @switch (state()) {
              @case ('starting') {
                {{ 'PAC.Plugin.RestartingTitle' | translate: { Default: 'Restarting API service' } }}
              }
              @case ('waiting') {
                {{ 'PAC.Plugin.RestartWaitingTitle' | translate: { Default: 'Waiting for API service' } }}
              }
              @case ('recovered') {
                {{ 'PAC.Plugin.RestartRecoveredTitle' | translate: { Default: 'API service is ready' } }}
              }
              @case ('error') {
                {{ 'PAC.Plugin.RestartFailedTitle' | translate: { Default: 'Restart could not be completed' } }}
              }
            }
          </h2>
          <p class="mt-1 text-sm leading-6 text-text-secondary">
            @switch (state()) {
              @case ('starting') {
                {{
                  'PAC.Plugin.RestartingDescription'
                    | translate: { Default: 'The server is draining active requests before restarting.' }
                }}
              }
              @case ('waiting') {
                {{
                  'PAC.Plugin.RestartWaitingDescription'
                    | translate
                      : { Default: 'The connection may be unavailable briefly. This page will recover automatically.' }
                }}
              }
              @case ('recovered') {
                {{
                  'PAC.Plugin.RestartRecoveredDescription'
                    | translate: { Default: 'Plugin changes are active. Reloading this page now.' }
                }}
              }
              @case ('error') {
                {{ error() }}
              }
            }
          </p>
        </div>
      </div>

      @if (state() === 'starting' || state() === 'waiting') {
        <div class="h-1.5 overflow-hidden rounded-full bg-components-input-bg-normal">
          <div class="h-full w-1/2 animate-pulse rounded-full bg-primary-600"></div>
        </div>
      }

      @if (state() === 'error') {
        <div class="flex justify-end gap-2">
          <button type="button" class="btn btn-secondary btn-medium" (click)="close()">
            {{ 'PAC.Plugin.RestartLater' | translate: { Default: 'Later' } }}
          </button>
          <button type="button" class="btn btn-primary btn-medium" (click)="retry()">
            <i class="ri-refresh-line mr-1"></i>
            {{ 'PAC.Plugin.RestartRetry' | translate: { Default: 'Try again' } }}
          </button>
        </div>
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
        key: 'PAC.Plugin.RestartAdminRequired',
        fallback: 'Ask a SuperAdmin in the default tenant scope to restart the API service.'
      },
      RUNTIME_RESTART_DEFAULT_TENANT_REQUIRED: {
        key: 'PAC.Plugin.RestartDefaultTenantRequired',
        fallback: 'The API service can only be restarted from the default tenant.'
      },
      RUNTIME_RESTART_INTERACTIVE_AUTH_REQUIRED: {
        key: 'PAC.Plugin.RestartInteractiveSessionRequired',
        fallback: 'Sign in with an interactive SuperAdmin session before restarting the API service.'
      },
      RUNTIME_RESTART_DISABLED: {
        key: 'PAC.Plugin.RestartDisabled',
        fallback: 'Controlled API restart is disabled for this deployment. Restart the service through operations.'
      },
      RUNTIME_RESTART_COORDINATION_UNAVAILABLE: {
        key: 'PAC.Plugin.RestartCoordinationUnavailable',
        fallback: 'Restart coordination is temporarily unavailable. Try again shortly.'
      },
      RUNTIME_RESTART_IN_PROGRESS: {
        key: 'PAC.Plugin.RestartAlreadyInProgress',
        fallback: 'Another API restart is already in progress. Wait for the service to recover.'
      }
    }
    const localized = errorCode ? localizedErrors[errorCode] : undefined
    if (localized) {
      return this.#translate.instant(localized.key, { Default: localized.fallback }) as string
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return this.#translate.instant('PAC.Plugin.RestartTimeout', {
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
