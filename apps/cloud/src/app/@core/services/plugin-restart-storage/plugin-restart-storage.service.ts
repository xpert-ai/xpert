/**
 * Browser state is scoped on every call; this storage service owns no current user or UI state.
 * Legacy migration verifies the new write before removing the original record.
 */
import { DOCUMENT, Injectable, inject } from '@angular/core'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import type { ActiveScope } from '../../state/store.service'
import {
  decodeConvergence,
  decodeLegacyPendingRestart,
  decodePendingRestart,
  type PendingPluginRuntimeConvergence,
  type PendingPluginRuntimeRestart,
  type RestartStateDecodeResult
} from './plugin-restart-state.schema'

export type PluginRestartScope = { userId: string; tenantId: string } & ActiveScope
export type RestartStateReadResult<T> = RestartStateDecodeResult<T> | { kind: 'missing' } | { kind: 'unavailable' }
export type RestartStateWriteResult = { kind: 'saved' } | { kind: 'unavailable' }
export type RestartStateClearResult = { kind: 'cleared' } | { kind: 'unavailable' }
export type RestartStateMigrationResult<T> =
  | RestartStateReadResult<T>
  | { kind: 'migrated'; value: T; legacyRetained: boolean }
  | { kind: 'unpersisted'; value: T; reason: 'unavailable' | 'verification-failed' }

const LEGACY_RESTART_KEY = 'xpert:plugins:runtime-restart-required:v1'
const LEGACY_CONVERGENCE_KEY = 'xpert:plugins:runtime-convergence:v1'

@Injectable({ providedIn: 'root' })
export class PluginRestartStorage {
  readonly #document = inject(DOCUMENT)

  loadPending(scope: PluginRestartScope): RestartStateReadResult<PendingPluginRuntimeRestart> {
    return this.read(this.key(scope, 'runtime-restart-required'), decodePendingRestart)
  }

  loadConvergence(scope: PluginRestartScope): RestartStateReadResult<PendingPluginRuntimeConvergence> {
    return this.read(this.key(scope, 'runtime-convergence'), decodeConvergence)
  }

  savePending(scope: PluginRestartScope, state: PendingPluginRuntimeRestart): RestartStateWriteResult {
    return this.write(this.key(scope, 'runtime-restart-required'), state)
  }

  saveConvergence(scope: PluginRestartScope, state: PendingPluginRuntimeConvergence): RestartStateWriteResult {
    return this.write(this.key(scope, 'runtime-convergence'), state)
  }

  clearPending(scope: PluginRestartScope): RestartStateClearResult {
    return this.clear(this.key(scope, 'runtime-restart-required'))
  }

  clearConvergence(scope: PluginRestartScope): RestartStateClearResult {
    return this.clear(this.key(scope, 'runtime-convergence'))
  }

  /** The caller must authorize adoption of unscoped legacy state before invoking migration. */
  migrateLegacyPending(scope: PluginRestartScope): RestartStateMigrationResult<PendingPluginRuntimeRestart> {
    return this.migrate(
      this.key(scope, 'runtime-restart-required'),
      LEGACY_RESTART_KEY,
      decodePendingRestart,
      decodeLegacyPendingRestart
    )
  }

  migrateLegacyConvergence(scope: PluginRestartScope): RestartStateMigrationResult<PendingPluginRuntimeConvergence> {
    return this.migrate(
      this.key(scope, 'runtime-convergence'),
      LEGACY_CONVERGENCE_KEY,
      decodeConvergence,
      decodeConvergence
    )
  }

  private key(scope: PluginRestartScope, entry: 'runtime-restart-required' | 'runtime-convergence') {
    const organizationId = scope.level === RequestScopeLevel.ORGANIZATION ? scope.organizationId : null
    const context = JSON.stringify([scope.userId, scope.tenantId, scope.level, organizationId])
    return `xpert:plugins:${entry}:v2:${context}`
  }

  private readRaw(key: string): RestartStateReadResult<string> {
    try {
      const storage = this.#document.defaultView?.localStorage
      if (!storage) return { kind: 'unavailable' }
      const raw = storage.getItem(key)
      return raw === null ? { kind: 'missing' } : { kind: 'found', value: raw }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  private read<T>(key: string, decode: (raw: string) => RestartStateDecodeResult<T>): RestartStateReadResult<T> {
    const raw = this.readRaw(key)
    return raw.kind === 'found' ? decode(raw.value) : raw
  }

  private write(
    key: string,
    state: PendingPluginRuntimeRestart | PendingPluginRuntimeConvergence
  ): RestartStateWriteResult {
    try {
      const storage = this.#document.defaultView?.localStorage
      if (!storage) return { kind: 'unavailable' }
      storage.setItem(key, JSON.stringify(state))
      return { kind: 'saved' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  private clear(key: string): RestartStateClearResult {
    try {
      const storage = this.#document.defaultView?.localStorage
      if (!storage) return { kind: 'unavailable' }
      storage.removeItem(key)
      return { kind: 'cleared' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  private migrate<T extends PendingPluginRuntimeRestart | PendingPluginRuntimeConvergence>(
    key: string,
    legacyKey: string,
    decode: (raw: string) => RestartStateDecodeResult<T>,
    decodeLegacy: (raw: string) => RestartStateDecodeResult<T>
  ): RestartStateMigrationResult<T> {
    const existing = this.read(key, decode)
    // Existing, invalid and unreadable destinations must not be replaced by unscoped history.
    if (existing.kind !== 'missing') return existing
    const raw = this.readRaw(legacyKey)
    if (raw.kind !== 'found') return raw
    const legacy = decodeLegacy(raw.value)
    if (legacy.kind !== 'found') return legacy
    const value = legacy.value
    if (this.write(key, value).kind === 'unavailable') return { kind: 'unpersisted', value, reason: 'unavailable' }
    const verified = this.readRaw(key)
    if (verified.kind === 'unavailable') return { kind: 'unpersisted', value, reason: 'unavailable' }
    if (verified.kind !== 'found' || verified.value !== JSON.stringify(value))
      return { kind: 'unpersisted', value, reason: 'verification-failed' }
    // Another tab may have replaced the legacy entry while this one was being migrated.
    const source = this.readRaw(legacyKey)
    const removed =
      source.kind === 'missing' ||
      (source.kind === 'found' && source.value === raw.value && this.clear(legacyKey).kind === 'cleared')
    return { kind: 'migrated', value, legacyRetained: !removed }
  }
}
