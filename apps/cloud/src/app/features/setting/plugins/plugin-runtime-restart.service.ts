import { Dialog } from '@angular/cdk/dialog'
import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { injectUser } from '@cloud/app/@core'
import { injectActiveScope, injectRuntimeControlAPI } from '@xpert-ai/cloud/state'
import {
  RUNTIME_RESTART_CONFIRMATION,
  type IRuntimeRestartCapability,
  type IRuntimeRestartResponse
} from '@xpert-ai/contracts'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { TranslateService } from '@ngx-translate/core'
import { catchError, filter, firstValueFrom, map, of, switchMap, take, timeout, timer } from 'rxjs'
import { PluginRuntimeRestartProgressComponent } from './plugin-runtime-restart-progress.component'

const STORAGE_KEY = 'xpert:plugins:runtime-restart-required:v1'
const READINESS_TIMEOUT_MS = 120_000
const READINESS_POLL_MS = 1_000

export interface PendingPluginRuntimeRestart {
  pluginNames: string[]
  requestedAt: string
  instanceId?: string
}

@Injectable({ providedIn: 'root' })
export class PluginRuntimeRestartService {
  readonly #dialog = inject(Dialog)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #runtimeControlAPI = injectRuntimeControlAPI()
  readonly #currentUser = injectUser()
  readonly #activeScope = injectActiveScope()

  readonly pending = signal<PendingPluginRuntimeRestart | null>(this.readPending())
  readonly restartCapability = signal<IRuntimeRestartCapability | null>(null)
  readonly canRestart = computed(() => this.restartCapability()?.allowed === true)
  readonly restartUnavailableMessageKey = computed(() => {
    switch (this.restartCapability()?.reason) {
      case 'default-tenant-required':
        return 'PAC.Plugin.RestartDefaultTenantRequired'
      default:
        return 'PAC.Plugin.RestartAdminRequired'
    }
  })
  readonly pendingPluginNames = computed(() => this.pending()?.pluginNames ?? [])

  #prompting = false
  #progressOpen = false

  constructor() {
    effect((onCleanup) => {
      this.#currentUser()
      this.#activeScope()
      this.restartCapability.set(null)
      const subscription = this.#runtimeControlAPI
        .restartCapability()
        .pipe(catchError(() => of(null)))
        .subscribe((capability) => this.restartCapability.set(capability))
      onCleanup(() => subscription.unsubscribe())
    })
    this.reconcilePendingRestart()
  }

  markRequired(pluginName?: string | null) {
    const normalizedName = pluginName?.trim()
    const existing = this.pending()
    const pluginNames = Array.from(
      new Set([...(existing?.pluginNames ?? []), ...(normalizedName ? [normalizedName] : [])])
    )
    const pending: PendingPluginRuntimeRestart = {
      pluginNames,
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      instanceId: existing?.instanceId
    }
    this.setPending(pending)

    if (!pending.instanceId) {
      this.#runtimeControlAPI
        .readiness()
        .pipe(
          take(1),
          catchError(() => of(null))
        )
        .subscribe((readiness) => {
          const current = this.pending()
          if (readiness && current && !current.instanceId) {
            this.setPending({ ...current, instanceId: readiness.instanceId })
          }
        })
    }
  }

  clearPending() {
    this.setPending(null)
  }

  async prompt() {
    if (!this.canRestart() || this.#prompting || this.#progressOpen) {
      return
    }

    this.#prompting = true
    try {
      const shouldRestart = await firstValueFrom(
        this.#alertDialog.confirm({
          title: this.t('PAC.Plugin.RestartRequiredTitle', 'API restart required'),
          description: this.restartDescription(),
          actionText: this.t('PAC.Plugin.RestartNow', 'Restart now'),
          cancelText: this.t('PAC.Plugin.RestartLater', 'Later'),
          closable: false,
          maskClosable: false
        })
      )
      if (shouldRestart) {
        await this.confirmAndRestart()
      }
    } finally {
      this.#prompting = false
    }
  }

  async confirmAndRestart() {
    if (!this.canRestart() || this.#progressOpen) {
      return
    }

    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.t('PAC.Plugin.RestartConfirmTitle', 'Restart the API service?'),
        description: this.t(
          'PAC.Plugin.RestartConfirmDescription',
          'Active API requests will be drained before the process restarts. Users may be disconnected briefly.'
        ),
        actionText: this.t('PAC.Plugin.RestartConfirmAction', 'Confirm restart'),
        cancelText: this.t('PAC.ACTIONS.Cancel', 'Cancel'),
        destructive: true,
        closable: false,
        maskClosable: false
      })
    )
    if (!confirmed) {
      return
    }

    this.#progressOpen = true
    const dialogRef = this.#dialog.open(PluginRuntimeRestartProgressComponent, {
      disableClose: true,
      backdropClass: 'backdrop-blur-sm-black',
      width: 'min(440px, calc(100vw - 32px))',
      data: {
        run: () => this.restartAndWait(),
        onRecovered: () => this.clearPending()
      }
    })
    dialogRef.closed.subscribe(() => {
      this.#progressOpen = false
    })
  }

  async restartAndWait() {
    const restart = await firstValueFrom(
      this.#runtimeControlAPI.restart({
        confirmation: RUNTIME_RESTART_CONFIRMATION,
        reason: 'Activate staged system plugin changes'
      })
    )

    await this.waitUntilReady(restart)
    return restart
  }

  private async waitUntilReady(restart: IRuntimeRestartResponse) {
    const initialDelay = Math.max(READINESS_POLL_MS, restart.signalAfterMs + 500)
    await firstValueFrom(
      timer(initialDelay, READINESS_POLL_MS).pipe(
        switchMap(() =>
          this.#runtimeControlAPI.readiness().pipe(
            map((readiness) =>
              readiness.status === 'ready' && readiness.instanceId !== restart.instanceId ? readiness : null
            ),
            catchError(() => of(null))
          )
        ),
        filter((readiness) => readiness !== null),
        take(1),
        timeout({ first: READINESS_TIMEOUT_MS })
      )
    )
  }

  private reconcilePendingRestart() {
    const pending = this.pending()
    if (!pending?.instanceId) {
      return
    }

    this.#runtimeControlAPI
      .readiness()
      .pipe(
        take(1),
        catchError(() => of(null))
      )
      .subscribe((readiness) => {
        if (readiness?.status === 'ready' && readiness.instanceId !== pending.instanceId) {
          this.clearPending()
        }
      })
  }

  private restartDescription() {
    const pluginNames = this.pendingPluginNames().join(', ')
    return this.t(
      'PAC.Plugin.RestartRequiredDescription',
      pluginNames
        ? `System plugin changes for ${pluginNames} are staged. Restart the API service to activate them.`
        : 'System plugin changes are staged. Restart the API service to activate them.',
      { pluginNames }
    )
  }

  private t(key: string, fallback: string, params: Record<string, unknown> = {}) {
    return this.#translate.instant(key, { Default: fallback, ...params }) as string
  }

  private setPending(value: PendingPluginRuntimeRestart | null) {
    this.pending.set(value)
    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Storage may be unavailable in privacy-restricted contexts; the signal still preserves session state.
    }
  }

  private readPending(): PendingPluginRuntimeRestart | null {
    try {
      const value = localStorage.getItem(STORAGE_KEY)
      if (!value) {
        return null
      }
      const parsed = JSON.parse(value) as Partial<PendingPluginRuntimeRestart>
      if (!Array.isArray(parsed.pluginNames) || typeof parsed.requestedAt !== 'string') {
        localStorage.removeItem(STORAGE_KEY)
        return null
      }
      return {
        pluginNames: parsed.pluginNames.filter((name): name is string => typeof name === 'string'),
        requestedAt: parsed.requestedAt,
        ...(typeof parsed.instanceId === 'string' ? { instanceId: parsed.instanceId } : {})
      }
    } catch {
      return null
    }
  }
}
