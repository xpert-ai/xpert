import { DOCUMENT } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { PluginRestartStorage, type PluginRestartScope } from './plugin-restart-storage.service'

const scope: PluginRestartScope = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  level: RequestScopeLevel.ORGANIZATION,
  organizationId: 'org-1'
}
const requirement = { scopeKey: 'org-1', pluginName: '@test/plugin', state: 'loaded' as const, version: '0.5.5' }
const pending = {
  pluginNames: ['@test/plugin'],
  requestedAt: '2026-09-09T00:00:00.000Z',
  runtimeRequirements: [requirement],
  error: 'Replica timed out'
}
const convergence = {
  pluginNames: ['@test/plugin'],
  requestedAt: pending.requestedAt,
  generation: 9,
  runtimeRequirements: [requirement],
  awaitingRestart: true
}
const pendingKey = 'xpert:plugins:runtime-restart-required:v2:["user-1","tenant-1","organization","org-1"]'
const convergenceKey = 'xpert:plugins:runtime-convergence:v2:["user-1","tenant-1","organization","org-1"]'
const legacyPendingKey = 'xpert:plugins:runtime-restart-required:v1'
const legacyConvergenceKey = 'xpert:plugins:runtime-convergence:v1'

describe('PluginRestartStorage', () => {
  let storage: PluginRestartStorage
  beforeEach(() => {
    localStorage.clear()
    TestBed.configureTestingModule({ teardown: { destroyAfterEach: true } })
    storage = TestBed.inject(PluginRestartStorage)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    TestBed.resetTestingModule()
    localStorage.clear()
  })

  it('keeps pending and convergence separate and compatible with existing v2 keys', () => {
    localStorage.setItem(pendingKey, JSON.stringify(pending))
    localStorage.setItem(convergenceKey, JSON.stringify(convergence))
    expect(storage.loadPending(scope)).toEqual({ kind: 'found', value: pending })
    expect(storage.loadConvergence(scope)).toEqual({ kind: 'found', value: convergence })
    expect(storage.clearPending(scope)).toEqual({ kind: 'cleared' })
    expect(storage.loadPending(scope)).toEqual({ kind: 'missing' })
    expect(storage.loadConvergence(scope)).toEqual({ kind: 'found', value: convergence })
    expect(storage.savePending(scope, pending)).toEqual({ kind: 'saved' })
    expect(storage.saveConvergence(scope, convergence)).toEqual({ kind: 'saved' })
    expect(storage.clearConvergence(scope)).toEqual({ kind: 'cleared' })
    expect(storage.loadPending(scope)).toEqual({ kind: 'found', value: pending })
    expect(storage.loadConvergence(scope)).toEqual({ kind: 'missing' })
  })

  it.each<PluginRestartScope>([
    { ...scope, userId: 'user-2' },
    { ...scope, tenantId: 'tenant-2' },
    { ...scope, organizationId: 'org-2' },
    { userId: 'user-1', tenantId: 'tenant-1', level: RequestScopeLevel.TENANT }
  ])('isolates each operation by its explicit scope: %j', (other) => {
    storage.savePending(scope, pending)
    expect(storage.loadPending(other)).toEqual({ kind: 'missing' })
    storage.savePending(other, { ...pending, pluginNames: ['other'] })
    storage.clearPending(scope)
    expect(storage.loadPending(other)).toMatchObject({ kind: 'found', value: { pluginNames: ['other'] } })
  })

  it('distinguishes missing, invalid and unavailable reads without deleting bad data', () => {
    expect(storage.loadPending(scope)).toEqual({ kind: 'missing' })
    localStorage.setItem(pendingKey, '{broken')
    expect(storage.loadPending(scope)).toEqual({ kind: 'invalid', reason: 'json' })
    expect(localStorage.getItem(pendingKey)).toBe('{broken')
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    expect(storage.loadPending(scope)).toEqual({ kind: 'unavailable' })
  })

  it('returns explicit failures when writes and deletion are denied', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    expect(storage.savePending(scope, pending)).toEqual({ kind: 'unavailable' })
    expect(storage.saveConvergence(scope, convergence)).toEqual({ kind: 'unavailable' })
    expect(storage.clearPending(scope)).toEqual({ kind: 'unavailable' })
    expect(storage.clearConvergence(scope)).toEqual({ kind: 'unavailable' })
  })

  it('handles a blocked localStorage getter', () => {
    jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('Blocked')
    })
    expect(storage.loadPending(scope)).toEqual({ kind: 'unavailable' })
    expect(storage.savePending(scope, pending)).toEqual({ kind: 'unavailable' })
  })

  it('handles a document without browser storage', () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: null } }] })
    storage = TestBed.inject(PluginRestartStorage)
    expect(storage.loadPending(scope)).toEqual({ kind: 'unavailable' })
    expect(storage.savePending(scope, pending)).toEqual({ kind: 'unavailable' })
    expect(storage.clearPending(scope)).toEqual({ kind: 'unavailable' })
  })

  it('verifies each migrated record before removing legacy data', () => {
    localStorage.setItem(legacyPendingKey, JSON.stringify(pending))
    localStorage.setItem(legacyConvergenceKey, JSON.stringify(convergence))
    const remove = jest.spyOn(Storage.prototype, 'removeItem')
    expect(storage.migrateLegacyPending(scope)).toEqual({ kind: 'migrated', value: pending, legacyRetained: false })
    expect(storage.migrateLegacyConvergence(scope)).toEqual({
      kind: 'migrated',
      value: convergence,
      legacyRetained: false
    })
    expect(storage.loadPending(scope)).toEqual({ kind: 'found', value: pending })
    expect(storage.loadConvergence(scope)).toEqual({ kind: 'found', value: convergence })
    expect(remove).toHaveBeenCalledWith(legacyPendingKey)
    expect(localStorage.getItem(legacyPendingKey)).toBeNull()
    expect(localStorage.getItem(legacyConvergenceKey)).toBeNull()
  })

  it('does not overwrite existing or malformed scoped records during migration', () => {
    localStorage.setItem(legacyPendingKey, JSON.stringify(pending))
    const newer = { ...pending, generation: 62 }
    storage.savePending(scope, newer)
    expect(storage.migrateLegacyPending(scope)).toEqual({ kind: 'found', value: newer })
    localStorage.setItem(pendingKey, '{broken')
    expect(storage.migrateLegacyPending(scope)).toEqual({ kind: 'invalid', reason: 'json' })
    expect(localStorage.getItem(legacyPendingKey)).toBe(JSON.stringify(pending))
    expect(localStorage.getItem(pendingKey)).toBe('{broken')
  })

  it('retains legacy data and returns session state when migration cannot persist', () => {
    localStorage.setItem(legacyPendingKey, JSON.stringify(pending))
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    expect(storage.migrateLegacyPending(scope)).toEqual({ kind: 'unpersisted', value: pending, reason: 'unavailable' })
    expect(localStorage.getItem(legacyPendingKey)).toBe(JSON.stringify(pending))
    expect(localStorage.getItem(pendingKey)).toBeNull()
  })

  it('retains the original if writing appears to succeed but read-back does not match', () => {
    localStorage.setItem(legacyConvergenceKey, JSON.stringify(convergence))
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
    expect(storage.migrateLegacyConvergence(scope)).toEqual({
      kind: 'unpersisted',
      value: convergence,
      reason: 'verification-failed'
    })
    expect(localStorage.getItem(legacyConvergenceKey)).toBe(JSON.stringify(convergence))
  })

  it('reports successful migration with retained legacy data when cleanup fails', () => {
    localStorage.setItem(legacyPendingKey, JSON.stringify(pending))
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    expect(storage.migrateLegacyPending(scope)).toEqual({ kind: 'migrated', value: pending, legacyRetained: true })
    expect(storage.loadPending(scope)).toEqual({ kind: 'found', value: pending })
    expect(localStorage.getItem(legacyPendingKey)).not.toBeNull()
  })

  it('does not remove a legacy record replaced by another tab during migration', () => {
    localStorage.setItem(legacyPendingKey, JSON.stringify(pending))
    const set = Storage.prototype.setItem
    const replacement = { ...pending, pluginNames: ['new-change'] }
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      set.call(this, key, value)
      if (key === pendingKey) set.call(this, legacyPendingKey, JSON.stringify(replacement))
    })
    expect(storage.migrateLegacyPending(scope)).toEqual({ kind: 'migrated', value: pending, legacyRetained: true })
    expect(localStorage.getItem(legacyPendingKey)).toBe(JSON.stringify(replacement))
  })
})
