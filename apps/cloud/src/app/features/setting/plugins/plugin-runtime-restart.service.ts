import { HttpErrorResponse } from '@angular/common/http'
import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { getErrorMessage, injectUser } from '@cloud/app/@core'
import { injectActiveScope, injectRuntimeControlAPI } from '@cloud/app/@core/state'
import {
  type IPluginRuntimeConvergence,
  type IRuntimePluginRequirement,
  RUNTIME_RESTART_CONFIRMATION,
  type IRuntimeRestartCapability
} from '@xpert-ai/contracts'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { TranslateService } from '@ngx-translate/core'
import { catchError, filter, firstValueFrom, map, of, switchMap, take, throwError, timer } from 'rxjs'

const STORAGE_KEY = 'xpert:plugins:runtime-restart-required:v1'
const CONVERGENCE_STORAGE_KEY = 'xpert:plugins:runtime-convergence:v1'
const RESTART_POLL_MS = 1_000

export interface PendingPluginRuntimeRestart {
  pluginNames: string[]
  requestedAt: string
  restartId?: string
  generation?: number
  runtimeRequirements?: IRuntimePluginRequirement[]
  error?: string
}

interface RuntimeRestartInProgressPayload {
  errorCode: 'RUNTIME_RESTART_IN_PROGRESS'
  restartId: string
}

interface PendingPluginRuntimeConvergence {
  pluginNames: string[]
  requestedAt: string
  generation: number
  runtimeRequirements: IRuntimePluginRequirement[]
}

@Injectable({ providedIn: 'root' })
export class PluginRuntimeRestartService {
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #runtimeControlAPI = injectRuntimeControlAPI()
  readonly #currentUser = injectUser()
  readonly #activeScope = injectActiveScope()

  readonly pending = signal<PendingPluginRuntimeRestart | null>(this.readPending())
  readonly convergence = signal<PendingPluginRuntimeConvergence | null>(this.readConvergence())
  readonly restartCapability = signal<IRuntimeRestartCapability | null>(null)
  readonly canRestart = computed(() => this.restartCapability()?.allowed === true)
  readonly requiresManualRestart = computed(
    () => !!this.pending() && !this.pending()?.restartId && !this.pending()?.generation
  )
  readonly isApplyingInBackground = computed(
    () => !!this.convergence() || !!this.pending()?.restartId || !!this.pending()?.generation
  )
  readonly lastError = computed(() => this.pending()?.error ?? null)
  readonly backgroundPluginNames = computed(() =>
    Array.from(
      new Set([
        ...(this.convergence()?.pluginNames ?? []),
        ...(this.pending()?.restartId || this.pending()?.generation ? (this.pending()?.pluginNames ?? []) : [])
      ])
    )
  )
  readonly restartUnavailableMessageKey = computed(() => {
    switch (this.restartCapability()?.reason) {
      case 'default-tenant-required':
        return 'XP.Plugin.RestartDefaultTenantRequired'
      default:
        return 'XP.Plugin.RestartAdminRequired'
    }
  })
  readonly pendingPluginNames = computed(() => this.pending()?.pluginNames ?? [])

  #prompting = false

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
    this.reconcilePendingState()
  }

  markRequired(pluginName?: string | null, runtimeRequirements: IRuntimePluginRequirement[] = []) {
    const normalizedName = pluginName?.trim()
    const existing = this.pending()
    const pluginNames = Array.from(
      new Set([...(existing?.pluginNames ?? []), ...(normalizedName ? [normalizedName] : [])])
    )
    const pending: PendingPluginRuntimeRestart = {
      pluginNames,
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      runtimeRequirements: this.mergeRuntimeRequirements([
        ...(existing?.runtimeRequirements ?? []),
        ...runtimeRequirements
      ])
    }
    this.setPending(pending)
  }

  trackPluginConvergence(
    convergence: IPluginRuntimeConvergence,
    pluginName?: string | null,
    runtimeRequirements: IRuntimePluginRequirement[] = []
  ) {
    const normalizedName = pluginName?.trim()
    const existing = this.convergence()
    this.setConvergence({
      pluginNames: Array.from(new Set([...(existing?.pluginNames ?? []), ...(normalizedName ? [normalizedName] : [])])),
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      generation: convergence.generation,
      runtimeRequirements: this.mergeRuntimeRequirements([
        ...(existing?.runtimeRequirements ?? []),
        ...runtimeRequirements
      ])
    })

    void this.monitorPluginConvergence(convergence.generation)
  }

  clearPending() {
    this.setPending(null)
  }

  async prompt() {
    if (!this.canRestart() || this.#prompting || this.pending()?.restartId || this.pending()?.generation) {
      return
    }

    this.#prompting = true
    try {
      const shouldRestart = await firstValueFrom(
        this.#alertDialog.confirm({
          title: this.t('XP.Plugin.RestartRequiredTitle', 'API restart required'),
          description: this.restartDescription(),
          actionText: this.t('XP.Plugin.RestartNow', 'Restart now'),
          cancelText: this.t('XP.Plugin.RestartLater', 'Later'),
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
    if (!this.canRestart() || this.pending()?.restartId || this.pending()?.generation) {
      return
    }

    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.t('XP.Plugin.RestartConfirmTitle', 'Restart the API service?'),
        description: this.t(
          'XP.Plugin.RestartConfirmDescription',
          'Active API requests will be drained before the process restarts. Users may be disconnected briefly.'
        ),
        actionText: this.t('XP.Plugin.RestartConfirmAction', 'Confirm restart'),
        cancelText: this.t('XP.ACTIONS.Cancel', 'Cancel'),
        destructive: true,
        closable: false,
        maskClosable: false
      })
    )
    if (!confirmed) {
      return
    }

    try {
      await this.startRestartInBackground()
    } catch (error) {
      const activeRestartId = this.restartInProgressId(error)
      if (activeRestartId && !this.pending()?.runtimeRequirements?.length) {
        this.trackRestart(activeRestartId, 0)
        return
      }
      this.setPendingError(getErrorMessage(error))
    }
  }

  private async startRestartInBackground() {
    const restart = await firstValueFrom(
      this.#runtimeControlAPI.restart({
        confirmation: RUNTIME_RESTART_CONFIRMATION,
        reason: 'Activate staged process-level plugin changes',
        runtimeRequirements: this.pending()?.runtimeRequirements
      })
    )

    if (restart.pluginGeneration) {
      this.trackPendingGeneration(restart.pluginGeneration)
    } else {
      this.trackRestart(restart.restartId, Math.max(RESTART_POLL_MS, restart.signalAfterMs + 500))
    }
    return restart
  }

  private trackPendingGeneration(generation: number) {
    const pending = this.pending()
    if (pending) {
      const current = { ...pending }
      delete current.error
      this.setPending({ ...current, generation })
    }
    void this.monitorPendingGeneration(generation)
  }

  private trackRestart(restartId: string, initialDelay: number) {
    const pending = this.pending()
    if (pending) {
      const current = { ...pending }
      delete current.error
      this.setPending({ ...current, restartId })
    }
    void this.monitorRestart(restartId, initialDelay)
  }

  private reconcilePendingState() {
    const convergence = this.convergence()
    if (convergence) {
      void this.monitorPluginConvergence(convergence.generation)
    }

    const pending = this.pending()
    if (!pending) {
      return
    }
    if (pending.restartId) {
      void this.monitorRestart(pending.restartId, 0)
    } else if (pending.generation) {
      void this.monitorPendingGeneration(pending.generation)
    }
  }

  private async monitorPluginConvergence(generation: number) {
    try {
      await this.pollPluginConvergence(generation)
      if (this.convergence()?.generation === generation) {
        this.setConvergence(null)
      }
    } catch (error) {
      this.convertConvergenceToManualRestart(generation, getErrorMessage(error))
    }
  }

  private async monitorRestart(restartId: string, initialDelay: number) {
    try {
      await this.pollRestart(restartId, initialDelay)
      if (this.pending()?.restartId === restartId) {
        this.clearPending()
      }
    } catch (error) {
      const current = this.pending()
      if (current?.restartId === restartId) {
        this.setPending({
          pluginNames: current.pluginNames,
          requestedAt: current.requestedAt,
          runtimeRequirements: current.runtimeRequirements,
          error: getErrorMessage(error)
        })
      }
    }
  }

  private async monitorPendingGeneration(generation: number) {
    try {
      await this.pollPluginConvergence(generation)
      if (this.pending()?.generation === generation) {
        this.clearPending()
      }
    } catch (error) {
      const current = this.pending()
      if (current?.generation === generation) {
        const retryable = { ...current, error: getErrorMessage(error) }
        delete retryable.generation
        this.setPending(retryable)
      }
    }
  }

  private async pollPluginConvergence(generation: number) {
    return await firstValueFrom(
      timer(0, RESTART_POLL_MS).pipe(
        switchMap(() =>
          this.#runtimeControlAPI
            .pluginConvergenceStatus(generation)
            .pipe(catchError((error: unknown) => (this.isNotFound(error) ? throwError(() => error) : of(null))))
        ),
        map((status) => {
          if (status?.status === 'failed') {
            throw new Error(status.error || 'Plugin runtime convergence failed')
          }
          return status?.status === 'completed' ? status : null
        }),
        filter((status) => status !== null),
        take(1)
      )
    )
  }

  private async pollRestart(restartId: string, initialDelay: number) {
    return await firstValueFrom(
      timer(initialDelay, RESTART_POLL_MS).pipe(
        switchMap(() =>
          this.#runtimeControlAPI
            .restartStatus(restartId)
            .pipe(catchError((error: unknown) => (this.isNotFound(error) ? throwError(() => error) : of(null))))
        ),
        map((status) => {
          if (status?.status === 'failed') {
            throw new Error(status.error || 'API replica restart failed')
          }
          return status?.status === 'completed' ? status : null
        }),
        filter((status) => status !== null),
        take(1)
      )
    )
  }

  private convertConvergenceToManualRestart(generation: number, error: string) {
    const current = this.convergence()
    if (current?.generation !== generation) {
      return
    }
    this.setConvergence(null)
    const pending = this.pending()
    this.setPending({
      pluginNames: Array.from(new Set([...(pending?.pluginNames ?? []), ...current.pluginNames])),
      requestedAt: pending?.requestedAt ?? current.requestedAt,
      runtimeRequirements: this.mergeRuntimeRequirements([
        ...(pending?.runtimeRequirements ?? []),
        ...current.runtimeRequirements
      ]),
      error
    })
  }

  private setPendingError(error: string) {
    const pending = this.pending()
    if (pending) {
      this.setPending({ ...pending, error })
    }
  }

  private mergeRuntimeRequirements(requirements: IRuntimePluginRequirement[]) {
    const merged = new Map<string, IRuntimePluginRequirement>()
    requirements.forEach((requirement) => {
      merged.set(`${requirement.scopeKey}\u0000${requirement.pluginName}`, requirement)
    })
    return Array.from(merged.values())
  }

  private isNotFound(error: unknown) {
    return error instanceof HttpErrorResponse && error.status === 404
  }

  private restartInProgressId(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
      return null
    }
    return this.isRuntimeRestartInProgressPayload(error.error) ? error.error.restartId : null
  }

  private isRuntimeRestartInProgressPayload(value: unknown): value is RuntimeRestartInProgressPayload {
    return (
      typeof value === 'object' &&
      value !== null &&
      'errorCode' in value &&
      value.errorCode === 'RUNTIME_RESTART_IN_PROGRESS' &&
      'restartId' in value &&
      typeof value.restartId === 'string' &&
      value.restartId.length > 0
    )
  }

  private restartDescription() {
    const pluginNames = this.pendingPluginNames().join(', ')
    return this.t(
      'XP.Plugin.RestartRequiredDescription',
      pluginNames
        ? `Plugin changes for ${pluginNames} are waiting to converge. Restart all API replicas to activate them.`
        : 'Plugin changes are waiting to converge. Restart all API replicas to activate them.',
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

  private setConvergence(value: PendingPluginRuntimeConvergence | null) {
    this.convergence.set(value)
    try {
      if (value) {
        localStorage.setItem(CONVERGENCE_STORAGE_KEY, JSON.stringify(value))
      } else {
        localStorage.removeItem(CONVERGENCE_STORAGE_KEY)
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
        ...(typeof parsed.restartId === 'string' ? { restartId: parsed.restartId } : {}),
        ...(typeof parsed.generation === 'number' ? { generation: parsed.generation } : {}),
        ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
        ...(Array.isArray(parsed.runtimeRequirements)
          ? { runtimeRequirements: parsed.runtimeRequirements as IRuntimePluginRequirement[] }
          : {})
      }
    } catch {
      return null
    }
  }

  private readConvergence(): PendingPluginRuntimeConvergence | null {
    try {
      const value = localStorage.getItem(CONVERGENCE_STORAGE_KEY)
      if (!value) return null
      const parsed = JSON.parse(value) as Partial<PendingPluginRuntimeConvergence>
      if (
        !Array.isArray(parsed.pluginNames) ||
        typeof parsed.requestedAt !== 'string' ||
        typeof parsed.generation !== 'number' ||
        !Array.isArray(parsed.runtimeRequirements)
      ) {
        localStorage.removeItem(CONVERGENCE_STORAGE_KEY)
        return null
      }
      return {
        pluginNames: parsed.pluginNames.filter((name): name is string => typeof name === 'string'),
        requestedAt: parsed.requestedAt,
        generation: parsed.generation,
        runtimeRequirements: parsed.runtimeRequirements as IRuntimePluginRequirement[]
      }
    } catch {
      return null
    }
  }
}
