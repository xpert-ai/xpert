/**
 * Waiting for restart approval retains the generation and continues polling: capacity can recover automatically.
 * Failed operations retain their identity; only authoritative completion can supersede their cached requirements.
 * Automatic convergence and unpublished manual work stay separate so unrelated completion cannot clear them.
 */
import { HttpErrorResponse } from '@angular/common/http'
import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core'
import { getErrorMessage, injectUser } from '@cloud/app/@core'
import { injectActiveScope, injectRuntimeControlAPI } from '@cloud/app/@core/state'
import {
  type IPluginRuntimeConvergence,
  type IPluginRuntimeSnapshot,
  type IRuntimePluginRequirement,
  RUNTIME_RESTART_CONFIRMATION,
  RolesEnum,
  RequestScopeLevel,
  type IRuntimeRestartCapability
} from '@xpert-ai/contracts'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { TranslateService } from '@ngx-translate/core'
import { catchError, filter, firstValueFrom, map, of, switchMap, take, takeWhile, throwError, timer } from 'rxjs'

import { currentRequirements, isRestartResolved } from './plugin-runtime-restart-policy'
import {
  PluginRestartStorage,
  type PluginRestartScope,
  type RestartStateMigrationResult,
  type PendingPluginRuntimeRestart,
  type PendingPluginRuntimeConvergence
} from '@cloud/app/@core/services/plugin-restart-storage'
export type { PendingPluginRuntimeRestart } from '@cloud/app/@core/services/plugin-restart-storage'

type StorageEntry = 'pending' | 'convergence'
type StorageIssue = 'invalid' | 'unavailable' | 'migration-incomplete'

const RESTART_POLL_MS = 1_000

interface RuntimeRestartInProgressPayload {
  errorCode: 'RUNTIME_RESTART_IN_PROGRESS'
  restartId: string
}

@Injectable({ providedIn: 'root' })
export class PluginRuntimeRestartService {
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #runtimeControlAPI = injectRuntimeControlAPI()
  readonly #currentUser = injectUser()
  readonly #activeScope = injectActiveScope()

  readonly #storage = inject(PluginRestartStorage)
  readonly storageIssues = signal<{ pending?: StorageIssue; convergence?: StorageIssue }>({})
  #storageScope = this.storageScope()
  #contextRevision = 0
  #reconciliation: Promise<IPluginRuntimeSnapshot | null> | null = null
  readonly pending = signal<PendingPluginRuntimeRestart | null>(this.readPending())
  readonly convergence = signal<PendingPluginRuntimeConvergence | null>(this.readConvergence())
  readonly restartCapability = signal<IRuntimeRestartCapability | null>(null)
  readonly completedRevision = signal(0)
  readonly canRestart = computed(() => this.restartCapability()?.allowed === true)
  readonly requiresManualRestart = computed(
    () => !this.hasActiveRestart() && (!!this.pending() || this.convergence()?.awaitingRestart === true)
  )
  readonly showManualRestart = computed(
    () => this.#currentUser()?.role?.name === RolesEnum.SUPER_ADMIN && this.requiresManualRestart()
  )
  readonly isApplyingInBackground = computed(
    () => (!!this.convergence() && !this.convergence()?.awaitingRestart) || this.hasActiveRestart()
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
  readonly pendingPluginNames = computed(() =>
    Array.from(
      new Set([
        ...(this.pending()?.pluginNames ?? []),
        ...(this.convergence()?.awaitingRestart ? this.convergence()!.pluginNames : [])
      ])
    )
  )

  #prompting = false
  #monitors = new Set<string>()

  constructor() {
    effect((onCleanup) => {
      const scope = this.storageScope()
      untracked(() => {
        if (!this.isSameStorageScope(scope)) {
          this.#contextRevision++
          this.#reconciliation = null
          this.#storageScope = scope
          this.pending.set(this.readPending())
          this.convergence.set(this.readConvergence())
          this.#prompting = false
        }
        this.restartCapability.set(null)
      })
      if (!scope) return
      const subscription = this.#runtimeControlAPI
        .restartCapability()
        .pipe(catchError(() => of(null)))
        .subscribe((capability) =>
          untracked(() => {
            this.restartCapability.set(capability)
            if (capability?.allowed) this.migrateLegacyState()
            this.reconcilePendingState()
            void this.reconcileCurrentState()
          })
        )
      onCleanup(() => subscription.unsubscribe())
    })
    const refresh = () => {
      void this.reconcileCurrentState()
    }
    const subscription = timer(5_000, 5_000).subscribe(refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    inject(DestroyRef).onDestroy(() => {
      this.#contextRevision++
      subscription.unsubscribe()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    })
  }

  private storageScope(): PluginRestartScope | null {
    const user = this.#currentUser()
    const tenantId = user?.tenantId ?? user?.tenant?.id
    const scope = this.#activeScope()
    return user?.id && tenantId && scope ? { userId: user.id, tenantId, ...scope } : null
  }

  private isSameStorageScope(scope: PluginRestartScope | null) {
    const current = this.#storageScope
    if (!scope || !current) return scope === current
    return (
      scope.userId === current.userId &&
      scope.tenantId === current.tenantId &&
      scope.level === current.level &&
      (scope.level !== RequestScopeLevel.ORGANIZATION ||
        (current.level === RequestScopeLevel.ORGANIZATION && scope.organizationId === current.organizationId))
    )
  }

  private migrateLegacyState() {
    const scope = this.#storageScope
    if (!scope) return
    // Only the capability-authorized coordinator may adopt unscoped legacy state.
    if (!this.pending()) this.pending.set(this.storedValue('pending', this.#storage.migrateLegacyPending(scope)))
    if (!this.convergence())
      this.convergence.set(this.storedValue('convergence', this.#storage.migrateLegacyConvergence(scope)))
  }

  private reconcileCurrentState(): Promise<IPluginRuntimeSnapshot | null> {
    if (!this.canRestart() || (!this.pending() && !this.convergence())) return Promise.resolve(null)
    if (!this.#reconciliation) {
      const request = this.readCurrentState().finally(() => {
        if (this.#reconciliation === request) this.#reconciliation = null
      })
      this.#reconciliation = request
    }
    return this.#reconciliation
  }

  private async readCurrentState(): Promise<IPluginRuntimeSnapshot | null> {
    const context = this.#contextRevision
    const pending = this.pending()
    const convergence = this.convergence()
    try {
      const snapshot = await firstValueFrom(this.#runtimeControlAPI.pluginRuntimeSnapshot())
      if (context !== this.#contextRevision) return null
      let completed = false
      if (pending && this.pending() === pending && isRestartResolved(pending, snapshot)) {
        this.clearPending()
        completed = true
      }
      if (convergence && this.convergence() === convergence && isRestartResolved(convergence, snapshot)) {
        this.setConvergence(null)
        completed = true
      }
      if (completed) this.completedRevision.update((revision) => revision + 1)
      return snapshot
    } catch {
      // An unavailable or unauthorized status endpoint is not evidence of recovery.
      return null
    }
  }

  markRequired(pluginName?: string | null, runtimeRequirements: IRuntimePluginRequirement[] = []) {
    const normalizedName = pluginName?.trim()
    const existing = this.pending()
    const pluginNames = Array.from(
      new Set([...(existing?.pluginNames ?? []), ...(normalizedName ? [normalizedName] : [])])
    )
    const pending: PendingPluginRuntimeRestart = {
      pluginNames,
      unpublishedRequirements: this.mergeRuntimeRequirements([
        ...(existing?.unpublishedRequirements ?? []),
        ...runtimeRequirements
      ]),
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
    const context = this.#contextRevision
    if (!this.canRestart() || this.#prompting || this.hasActiveRestart()) {
      return
    }

    this.#prompting = true
    try {
      const shouldRestart = await firstValueFrom(
        this.#alertDialog.confirm({
          layout: 'standard',
          title: this.t('XP.Plugin.RestartRequiredTitle', 'API restart required'),
          description: this.restartDescription(),
          actionText: this.t('XP.Plugin.RestartNow', 'Restart now'),
          cancelText: this.t('XP.Plugin.RestartLater', 'Later'),
          closable: false,
          maskClosable: false
        })
      )
      if (shouldRestart && context === this.#contextRevision) {
        await this.confirmAndRestart()
      }
    } finally {
      this.#prompting = false
    }
  }

  async confirmAndRestart() {
    const context = this.#contextRevision
    if (!this.canRestart() || this.hasActiveRestart()) {
      return
    }

    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        layout: 'standard',
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
    // Capacity may have recovered and completed this release while the confirmation dialog was open.
    if (!confirmed || context !== this.#contextRevision || !this.requiresManualRestart()) {
      return
    }

    try {
      await this.startRestartInBackground()
    } catch (error) {
      if (context !== this.#contextRevision) return
      const activeRestartId = this.restartInProgressId(error)
      if (activeRestartId && !this.pending()?.runtimeRequirements?.length) {
        this.trackRestart(activeRestartId, 0)
        return
      }
      this.setPendingError(getErrorMessage(error))
    }
  }

  private async startRestartInBackground() {
    const context = this.#contextRevision
    const waiting = this.convergence()
    if (waiting?.awaitingRestart) this.convertConvergenceToManualRestart(waiting.generation)
    // Fetch before requesting consented work; only the server can supply current requirements.
    const snapshot = await this.reconcileCurrentState()
    if (context !== this.#contextRevision || !this.requiresManualRestart()) return
    if (!snapshot)
      throw new Error(
        this.t(
          'XP.Plugin.RestartStatusUnavailable',
          'Unable to verify current plugin state. Try again when the API is available.'
        )
      )
    const pending = this.pending()
    const requirements = pending?.runtimeRequirements?.length ? currentRequirements(pending, snapshot) : []
    if (!requirements)
      throw new Error(
        this.t(
          'XP.Plugin.RestartRequirementsChanged',
          'Plugin requirements could not be verified. Refresh or retry the plugin change before restarting.'
        )
      )
    const restart = await firstValueFrom(
      this.#runtimeControlAPI.restart({
        confirmation: RUNTIME_RESTART_CONFIRMATION,
        allowDowntime: true,
        reason: 'Activate staged process-level plugin changes',
        runtimeRequirements: requirements,
        expectedGeneration: snapshot.generation
      })
    )
    if (context !== this.#contextRevision || this.pending() !== pending) return restart
    if (pending) this.setPending({ ...pending, runtimeRequirements: requirements, unpublishedRequirements: [] })
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
      delete current.awaitingRestart
      delete current.restartId
      this.setPending({ ...current, generation, status: 'in_progress', unpublishedRequirements: [] })
    }
    void this.monitorPendingGeneration(generation)
  }

  private trackRestart(restartId: string, initialDelay: number) {
    const pending = this.pending()
    if (pending) {
      const current = { ...pending }
      delete current.error
      delete current.awaitingRestart
      delete current.generation
      this.setPending({ ...current, restartId, status: 'in_progress' })
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
    if (pending.status === 'failed' || pending.status === 'unknown') return
    if (pending.restartId) {
      void this.monitorRestart(pending.restartId, 0)
    } else if (pending.generation) {
      void this.monitorPendingGeneration(pending.generation)
    }
  }

  private async monitorPluginConvergence(generation: number) {
    const context = this.#contextRevision
    const key = `convergence:${context}:${generation}`
    if (this.#monitors.has(key)) return
    this.#monitors.add(key)
    try {
      const status = await this.pollPluginConvergence(
        generation,
        () => context === this.#contextRevision && this.convergence()?.generation === generation,
        (awaitingRestart) => {
          const current = this.convergence()
          if (current?.generation === generation && !!current.awaitingRestart !== awaitingRestart) {
            this.setConvergence({ ...current, awaitingRestart })
          }
        }
      )
      if (status && context === this.#contextRevision && this.convergence()?.generation === generation) {
        this.setConvergence(null)
        this.completedRevision.update((revision) => revision + 1)
      }
    } catch (error) {
      if (context === this.#contextRevision) this.convertConvergenceToManualRestart(generation, getErrorMessage(error))
    } finally {
      this.#monitors.delete(key)
    }
  }

  private async monitorRestart(restartId: string, initialDelay: number) {
    const context = this.#contextRevision
    const key = `restart:${context}:${restartId}`
    if (this.#monitors.has(key)) return
    this.#monitors.add(key)
    try {
      const status = await this.pollRestart(restartId, initialDelay, context)
      if (status && context === this.#contextRevision && this.pending()?.restartId === restartId) {
        this.clearPending()
        this.completedRevision.update((revision) => revision + 1)
      }
    } catch (error) {
      const current = this.pending()
      if (context === this.#contextRevision && current?.restartId === restartId) {
        this.setPending({
          ...current,
          status: this.isNotFound(error) ? 'unknown' : 'failed',
          error: getErrorMessage(error)
        })
      }
    } finally {
      this.#monitors.delete(key)
    }
  }

  private async monitorPendingGeneration(generation: number) {
    const context = this.#contextRevision
    const key = `generation:${context}:${generation}`
    if (this.#monitors.has(key)) return
    this.#monitors.add(key)
    try {
      const status = await this.pollPluginConvergence(
        generation,
        () => context === this.#contextRevision && this.pending()?.generation === generation,
        (awaitingRestart) => {
          const current = this.pending()
          if (current?.generation === generation && !!current.awaitingRestart !== awaitingRestart) {
            this.setPending({ ...current, awaitingRestart })
          }
        }
      )
      if (status && context === this.#contextRevision && this.pending()?.generation === generation) {
        this.clearPending()
        this.completedRevision.update((revision) => revision + 1)
      }
    } catch (error) {
      const current = this.pending()
      if (context === this.#contextRevision && current?.generation === generation) {
        const retryable: PendingPluginRuntimeRestart = {
          ...current,
          status: this.isNotFound(error) ? 'unknown' : 'failed',
          error: getErrorMessage(error)
        }
        delete retryable.awaitingRestart
        this.setPending(retryable)
      }
    } finally {
      this.#monitors.delete(key)
    }
  }

  private hasActiveRestart() {
    const pending = this.pending()
    if (pending?.status === 'failed' || pending?.status === 'unknown') return false
    return !!pending?.restartId || (!!pending?.generation && !pending.awaitingRestart)
  }

  private async pollPluginConvergence(
    generation: number,
    isCurrent: () => boolean,
    updateWaiting: (waiting: boolean) => void
  ) {
    return await firstValueFrom(
      timer(0, RESTART_POLL_MS).pipe(
        // Superseded generations no longer own UI state; stop their polling instead of retaining orphan timers.
        takeWhile(isCurrent),
        switchMap(() =>
          this.#runtimeControlAPI
            .pluginConvergenceStatus(generation)
            .pipe(catchError((error: unknown) => (this.isNotFound(error) ? throwError(() => error) : of(null))))
        ),
        map((status) => {
          if (status?.status === 'failed') {
            throw new Error(status.error || 'Plugin runtime convergence failed')
          }
          // Awaiting restart is actionable but nonterminal; only completion or failure ends tracking.
          if (status && isCurrent()) updateWaiting(status.status === 'awaiting_restart')
          return status?.status === 'completed' ? status : null
        }),
        filter((status) => status !== null),
        take(1)
      ),
      { defaultValue: null }
    )
  }

  private async pollRestart(restartId: string, initialDelay: number, context: number) {
    return await firstValueFrom(
      timer(initialDelay, RESTART_POLL_MS).pipe(
        takeWhile(() => context === this.#contextRevision && this.pending()?.restartId === restartId),
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
      ),
      { defaultValue: null }
    )
  }

  private convertConvergenceToManualRestart(generation: number, error?: string) {
    const current = this.convergence()
    if (current?.generation !== generation) {
      return
    }
    this.setConvergence(null)
    const pending = this.pending()
    this.setPending({
      pluginNames: Array.from(new Set([...(pending?.pluginNames ?? []), ...current.pluginNames])),
      requestedAt: pending?.requestedAt ?? current.requestedAt,
      generation,
      unpublishedRequirements: pending?.unpublishedRequirements,
      status: error ? 'failed' : 'awaiting_restart',
      awaitingRestart: !error,
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
    const scope = this.#storageScope
    if (!scope) return
    const result = value ? this.#storage.savePending(scope, value) : this.#storage.clearPending(scope)
    this.setStorageIssue('pending', result.kind === 'unavailable' ? 'unavailable' : undefined)
  }

  private setConvergence(value: PendingPluginRuntimeConvergence | null) {
    this.convergence.set(value)
    const scope = this.#storageScope
    if (!scope) return
    const result = value ? this.#storage.saveConvergence(scope, value) : this.#storage.clearConvergence(scope)
    this.setStorageIssue('convergence', result.kind === 'unavailable' ? 'unavailable' : undefined)
  }

  private readPending(): PendingPluginRuntimeRestart | null {
    return this.storedValue(
      'pending',
      this.#storageScope ? this.#storage.loadPending(this.#storageScope) : { kind: 'missing' }
    )
  }

  private readConvergence(): PendingPluginRuntimeConvergence | null {
    return this.storedValue(
      'convergence',
      this.#storageScope ? this.#storage.loadConvergence(this.#storageScope) : { kind: 'missing' }
    )
  }

  private storedValue<T>(entry: StorageEntry, result: RestartStateMigrationResult<T>): T | null {
    switch (result.kind) {
      case 'found':
        this.setStorageIssue(entry)
        return result.value
      case 'migrated':
        this.setStorageIssue(entry, result.legacyRetained ? 'migration-incomplete' : undefined)
        return result.value
      case 'unpersisted':
        this.setStorageIssue(entry, result.reason === 'unavailable' ? 'unavailable' : 'migration-incomplete')
        return result.value
      case 'invalid':
      case 'unavailable':
        this.setStorageIssue(entry, result.kind)
        return null
      case 'missing':
        this.setStorageIssue(entry)
        return null
    }
  }

  private setStorageIssue(entry: StorageEntry, issue?: StorageIssue) {
    this.storageIssues.update((current) => {
      const next = { ...current }
      if (issue) next[entry] = issue
      else delete next[entry]
      return next
    })
  }
}
