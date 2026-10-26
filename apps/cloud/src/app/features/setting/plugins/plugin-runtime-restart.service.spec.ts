import { Dialog } from '@angular/cdk/dialog'
import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { RuntimeControlAPIService, Store } from '@cloud/app/@core/state'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { TranslateService } from '@ngx-translate/core'
import { type IPluginRuntimeSnapshot, RequestScopeLevel, RolesEnum } from '@xpert-ai/contracts'
import { BehaviorSubject, type Observable, of, Subject, throwError } from 'rxjs'
import { PluginRuntimeRestartService } from './plugin-runtime-restart.service'

describe('PluginRuntimeRestartService', () => {
  const user = new BehaviorSubject<{ id?: string; tenantId?: string; role: { name: RolesEnum } } | null>(null)
  const runtimeControlAPI = {
    pluginRuntimeSnapshot: jest.fn<Observable<IPluginRuntimeSnapshot>, []>(),
    restartCapability: jest.fn(() => of({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })),
    pluginConvergenceStatus: jest.fn(),
    restartStatus: jest.fn(),
    restart: jest.fn(),
    readiness: jest.fn()
  }
  const scope = new BehaviorSubject({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' })
  const store = {
    user$: user,
    activeScope: { level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' },
    selectActiveScope: jest.fn(() => scope)
  }
  const dialog = { open: jest.fn() }
  const alertDialog = { confirm: jest.fn() }

  beforeEach(() => {
    localStorage.clear()
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' })
    jest.clearAllMocks()
    user.next({ id: 'user-1', tenantId: 'tenant-1', role: { name: RolesEnum.ADMIN } })
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(of({ generation: 0, status: null, requirements: [] }))
    runtimeControlAPI.restartCapability.mockReturnValue(
      of({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    )
    TestBed.configureTestingModule({
      teardown: { destroyAfterEach: true },
      providers: [
        PluginRuntimeRestartService,
        { provide: RuntimeControlAPIService, useValue: runtimeControlAPI },
        { provide: Store, useValue: store },
        { provide: Dialog, useValue: dialog },
        { provide: ZardAlertDialogService, useValue: alertDialog },
        {
          provide: TranslateService,
          useValue: { instant: jest.fn((_: string, params: { Default: string }) => params.Default) }
        }
      ]
    })
  })

  function createService() {
    const service = TestBed.inject(PluginRuntimeRestartService)
    TestBed.tick()
    return service
  }

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
    jest.useRealTimers()
    localStorage.clear()
  })

  it.each([false, true])('waits for both real confirmation dialogs before restarting (%s)', async (confirmed) => {
    TestBed.overrideProvider(Dialog, { useFactory: () => new Dialog() })
    TestBed.overrideProvider(ZardAlertDialogService, { useFactory: () => new ZardAlertDialogService() })
    runtimeControlAPI.restart.mockReturnValue(
      of({
        accepted: true,
        restartId: 'restart-two-step',
        mode: 'rolling-self-signal',
        instanceId: 'api-1',
        requestedAt: new Date().toISOString(),
        signalAfterMs: 750,
        drainTimeoutMs: 30_000
      })
    )
    runtimeControlAPI.restartStatus.mockReturnValue(new Subject())
    const service = createService()
    service.restartCapability.set({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    service.markRequired('@xpert-ai/plugin-test')

    const pending = service.prompt()
    TestBed.tick()
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click()
    TestBed.tick()
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
    document.querySelector<HTMLButtonElement>('[data-testid="z-alert-dialog-action"]')!.click()
    await flushAsync()
    TestBed.tick()
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Restart the API service?')
    expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
    const action = confirmed ? 'action' : 'cancel'
    document.querySelector<HTMLButtonElement>(`[data-testid="z-alert-dialog-${action}"]`)!.click()
    await pending
    expect(runtimeControlAPI.restart).toHaveBeenCalledTimes(confirmed ? 1 : 0)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('keeps polling while awaiting capacity and follows automatic resumption without requesting an outage', async () => {
    jest.useFakeTimers()
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 19, status: 'awaiting_restart' }))
    const service = createService()
    service.trackPluginConvergence({ generation: 19 }, '@xpert-ai/plugin-meetings')
    await jest.advanceTimersByTimeAsync(1000)
    expect(service.isApplyingInBackground()).toBe(false)
    expect(service.requiresManualRestart()).toBe(true)
    expect(service.lastError()).toBeNull()
    expect(service.convergence()).toMatchObject({ generation: 19, awaitingRestart: true })
    expect(service.pendingPluginNames()).toEqual(['@xpert-ai/plugin-meetings'])
    const calls = runtimeControlAPI.pluginConvergenceStatus.mock.calls.length
    await jest.advanceTimersByTimeAsync(60_000)
    expect(runtimeControlAPI.pluginConvergenceStatus.mock.calls.length).toBeGreaterThan(calls)
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 19, status: 'in_progress' }))
    await jest.advanceTimersByTimeAsync(1000)
    expect(service.isApplyingInBackground()).toBe(true)
    expect(service.requiresManualRestart()).toBe(false)
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 19, status: 'completed' }))
    await jest.advanceTimersByTimeAsync(1000)
    expect(service.convergence()).toBeNull()
    expect(service.completedRevision()).toBe(1)
    expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
  })

  it('resumes a stored waiting generation after reload without clearing an unrelated manual restart', async () => {
    jest.useFakeTimers()
    localStorage.setItem(
      'xpert:plugins:runtime-convergence:v2:["user-1","tenant-1","organization","org-1"]',
      JSON.stringify({
        generation: 19,
        awaitingRestart: true,
        requestedAt: new Date().toISOString(),
        pluginNames: ['@test/automatic'],
        runtimeRequirements: []
      })
    )
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 19, status: 'awaiting_restart' }))
    const service = createService()
    service.markRequired('@test/manual')
    await jest.advanceTimersByTimeAsync(1000)
    expect(service.pendingPluginNames()).toEqual(['@test/manual', '@test/automatic'])
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 19, status: 'completed' }))
    await jest.advanceTimersByTimeAsync(1000)
    expect(service.convergence()).toBeNull()
    expect(service.pending()).toMatchObject({ pluginNames: ['@test/manual'] })
    expect(service.requiresManualRestart()).toBe(true)
  })

  it('continues polling a stored manual generation that is awaiting capacity', async () => {
    jest.useFakeTimers()
    localStorage.setItem(
      'xpert:plugins:runtime-restart-required:v2:["user-1","tenant-1","organization","org-1"]',
      JSON.stringify({
        generation: 20,
        awaitingRestart: true,
        requestedAt: new Date().toISOString(),
        pluginNames: ['@test/manual']
      })
    )
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 20, status: 'awaiting_restart' }))
    const service = createService()
    await jest.advanceTimersByTimeAsync(1000)
    expect(service.requiresManualRestart()).toBe(true)
    expect(service.pending()).toMatchObject({ generation: 20 })
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 20, status: 'in_progress' }))
    await jest.advanceTimersByTimeAsync(1000)
    expect(service.requiresManualRestart()).toBe(false)
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 20, status: 'completed' }))
    await jest.advanceTimersByTimeAsync(1000)
    expect(service.pending()).toBeNull()
  })

  it('submits waiting requirements only after explicit confirmation and tracks the newly approved generation', async () => {
    jest.useFakeTimers()
    alertDialog.confirm.mockReturnValue(of(true))
    runtimeControlAPI.restart.mockReturnValue(of({ restartId: 'restart-21', pluginGeneration: 21 }))
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 19, status: 'awaiting_restart' }))
    const service = createService()
    service.restartCapability.set({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    const requirements = [{ scopeKey: 'org-1', pluginName: '@test/automatic', state: 'loaded' as const }]
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({ generation: 19, status: 'awaiting_restart', requirements })
    )
    service.trackPluginConvergence({ generation: 19 }, '@test/automatic', requirements)
    await jest.advanceTimersByTimeAsync(1000)
    expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
    await service.confirmAndRestart()
    expect(runtimeControlAPI.restart).toHaveBeenCalledWith(
      expect.objectContaining({
        allowDowntime: true,
        runtimeRequirements: requirements
      })
    )
    expect(service.pending()).toMatchObject({ generation: 21, pluginNames: ['@test/automatic'] })
    expect(service.convergence()).toBeNull()
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 21, status: 'completed' }))
    await jest.advanceTimersByTimeAsync(1000)
    const oldCalls = runtimeControlAPI.pluginConvergenceStatus.mock.calls.filter(
      ([generation]) => generation === 19
    ).length
    await jest.advanceTimersByTimeAsync(5000)
    expect(
      runtimeControlAPI.pluginConvergenceStatus.mock.calls.filter(([generation]) => generation === 19)
    ).toHaveLength(oldCalls)
    expect(service.pending()).toBeNull()
  })

  it('does not request a restart if automatic convergence finishes while the confirmation is open', async () => {
    jest.useFakeTimers()
    const confirmation = new Subject<boolean>()
    alertDialog.confirm.mockReturnValue(confirmation)
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 19, status: 'awaiting_restart' }))
    const service = createService()
    service.restartCapability.set({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    service.trackPluginConvergence({ generation: 19 }, '@test/automatic')
    await jest.advanceTimersByTimeAsync(1000)
    const confirming = service.confirmAndRestart()
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(of({ generation: 19, status: 'completed' }))
    await jest.advanceTimersByTimeAsync(1000)
    confirmation.next(true)
    await confirming
    expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
    expect(service.convergence()).toBeNull()
  })

  it('shows manual restart only to superadmins and keeps background progress visible to other roles', () => {
    const service = createService()
    service.markRequired('@xpert-ai/plugin-test')
    expect(service.showManualRestart()).toBe(false)
    user.next({ role: { name: RolesEnum.ADMIN } })
    expect(service.showManualRestart()).toBe(false)
    user.next({ role: { name: RolesEnum.SUPER_ADMIN } })
    expect(service.showManualRestart()).toBe(true)
    user.next({ role: { name: RolesEnum.ADMIN } })
    expect(service.showManualRestart()).toBe(false)
    expect(service.requiresManualRestart()).toBe(true)
    service.pending.update((pending) => ({ ...pending!, restartId: 'restart-1' }))
    expect(service.isApplyingInBackground()).toBe(true)
    expect(service.showManualRestart()).toBe(false)
  })

  it('keeps automatic convergence durable until the backend generation completes', async () => {
    const status = new Subject<Record<string, unknown>>()
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(status)
    const service = createService()

    service.trackPluginConvergence({ generation: 7 }, '@xpert-ai/plugin-openrouter', [
      {
        scopeKey: 'org-1',
        pluginName: '@xpert-ai/plugin-openrouter',
        version: '0.1.0',
        state: 'loaded'
      }
    ])
    await flushAsync()

    expect(runtimeControlAPI.pluginConvergenceStatus).toHaveBeenCalledWith(7)
    expect(service.pending()).toBeNull()
    expect(service.convergence()).toMatchObject({ generation: 7 })
    expect(
      localStorage.getItem('xpert:plugins:runtime-restart-required:v2:["user-1","tenant-1","organization","org-1"]')
    ).toBeNull()
    expect(
      localStorage.getItem('xpert:plugins:runtime-convergence:v2:["user-1","tenant-1","organization","org-1"]')
    ).not.toBeNull()

    status.next({
      generation: 7,
      status: 'completed',
      restartId: 'restart-7',
      targetReplicaCount: 3,
      completedReplicaCount: 3,
      failedReplicaCount: 0
    })
    await flushAsync()

    expect(service.convergence()).toBeNull()
    expect(
      localStorage.getItem('xpert:plugins:runtime-convergence:v2:["user-1","tenant-1","organization","org-1"]')
    ).toBeNull()
  })

  it('keeps automatic convergence in progress beyond six minutes until the backend completes', async () => {
    jest.useFakeTimers()
    const status = new Subject<Record<string, unknown>>()
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(status)
    const service = createService()

    service.trackPluginConvergence({ generation: 11 }, '@xpert-ai/plugin-openrouter')
    await jest.advanceTimersByTimeAsync(6 * 60_000 + 1_000)

    expect(service.convergence()).toMatchObject({ generation: 11 })
    expect(service.requiresManualRestart()).toBe(false)

    status.next({
      generation: 11,
      status: 'completed',
      targetReplicaCount: 9,
      completedReplicaCount: 9,
      failedReplicaCount: 0
    })
    await flushPromises()

    expect(service.convergence()).toBeNull()
    jest.useRealTimers()
  })

  it('does not clear an earlier manual system-plugin restart when organization convergence completes', async () => {
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(
      of({
        generation: 8,
        status: 'completed',
        targetReplicaCount: 1,
        completedReplicaCount: 1,
        failedReplicaCount: 0
      })
    )
    const service = createService()
    service.markRequired('@xpert-ai/plugin-system-demo', [
      {
        scopeKey: 'system:global',
        pluginName: '@xpert-ai/plugin-system-demo',
        version: '1.0.0',
        state: 'loaded'
      }
    ])

    service.trackPluginConvergence({ generation: 8 }, '@xpert-ai/plugin-openrouter', [
      {
        scopeKey: 'org-1',
        pluginName: '@xpert-ai/plugin-openrouter',
        version: '0.1.0',
        state: 'loaded'
      }
    ])
    await flushAsync()

    expect(service.pending()).toMatchObject({ pluginNames: ['@xpert-ai/plugin-system-demo'] })
    expect(service.requiresManualRestart()).toBe(true)
    expect(service.convergence()).toBeNull()
  })

  it('stops polling a missing generation and exposes a retryable manual restart', async () => {
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' }))
    )
    const service = createService()

    service.trackPluginConvergence({ generation: 9 }, '@xpert-ai/plugin-openrouter', [
      {
        scopeKey: 'org-1',
        pluginName: '@xpert-ai/plugin-openrouter',
        version: '0.1.0',
        state: 'loaded'
      }
    ])
    await flushAsync()

    expect(runtimeControlAPI.pluginConvergenceStatus).toHaveBeenCalledTimes(1)
    expect(service.requiresManualRestart()).toBe(true)
    expect(service.pending()).toMatchObject({
      pluginNames: ['@xpert-ai/plugin-openrouter'],
      runtimeRequirements: [
        {
          scopeKey: 'org-1',
          pluginName: '@xpert-ai/plugin-openrouter',
          version: '0.1.0',
          state: 'loaded'
        }
      ]
    })
    expect(service.pending()).not.toHaveProperty('convergenceGeneration')
  })

  it('preserves the backend failure reason when automatic convergence falls back to manual restart', async () => {
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(
      of({
        generation: 10,
        status: 'failed',
        targetReplicaCount: 3,
        completedReplicaCount: 2,
        failedReplicaCount: 1,
        error: 'Plugin openrouter loaded 0.0.2 instead of 0.1.0'
      })
    )
    const service = createService()

    service.trackPluginConvergence({ generation: 10 }, '@xpert-ai/plugin-openrouter')
    await flushAsync()

    expect(service.requiresManualRestart()).toBe(true)
    expect(service.lastError()).toBe('Plugin openrouter loaded 0.0.2 instead of 0.1.0')
  })

  it('preserves the backend failure reason when a background manual restart fails', async () => {
    localStorage.setItem(
      'xpert:plugins:runtime-restart-required:v2:["user-1","tenant-1","organization","org-1"]',
      JSON.stringify({
        pluginNames: ['@xpert-ai/plugin-system-demo'],
        requestedAt: new Date().toISOString(),
        restartId: 'restart-failed'
      })
    )
    runtimeControlAPI.restartStatus.mockReturnValue(
      of({
        restartId: 'restart-failed',
        mode: 'rolling-self-signal',
        status: 'failed',
        requestedAt: new Date().toISOString(),
        targetReplicaCount: 3,
        completedReplicaCount: 2,
        failedReplicaCount: 1,
        pluginGeneration: 0,
        error: 'Replica api-3 did not return after restart'
      })
    )

    const service = createService()
    await flushAsync()

    expect(service.requiresManualRestart()).toBe(true)
    expect(service.lastError()).toBe('Replica api-3 did not return after restart')
  })

  it('keeps a manual background restart in progress beyond six minutes until the backend completes', async () => {
    jest.useFakeTimers()
    localStorage.setItem(
      'xpert:plugins:runtime-restart-required:v2:["user-1","tenant-1","organization","org-1"]',
      JSON.stringify({
        pluginNames: ['@xpert-ai/plugin-system-demo'],
        requestedAt: new Date().toISOString(),
        restartId: 'restart-long-running'
      })
    )
    const status = new Subject<Record<string, unknown>>()
    runtimeControlAPI.restartStatus.mockReturnValue(status)

    const service = createService()
    await jest.advanceTimersByTimeAsync(6 * 60_000 + 1_000)

    expect(service.pending()).toMatchObject({ restartId: 'restart-long-running' })
    expect(service.isApplyingInBackground()).toBe(true)
    expect(service.requiresManualRestart()).toBe(false)

    status.next({
      restartId: 'restart-long-running',
      mode: 'rolling-self-signal',
      status: 'completed',
      requestedAt: new Date().toISOString(),
      targetReplicaCount: 9,
      completedReplicaCount: 9,
      failedReplicaCount: 0,
      pluginGeneration: 0
    })
    await flushPromises()

    expect(service.pending()).toBeNull()
    jest.useRealTimers()
  })

  it('submits a manual restart as a background task without opening a blocking progress dialog', async () => {
    alertDialog.confirm.mockReturnValue(of(true))
    runtimeControlAPI.restart.mockReturnValue(
      of({
        accepted: true,
        restartId: 'restart-system',
        mode: 'rolling-self-signal',
        instanceId: 'api-1',
        requestedAt: new Date().toISOString(),
        signalAfterMs: 750,
        drainTimeoutMs: 30_000
      })
    )
    runtimeControlAPI.restartStatus.mockReturnValue(new Subject())
    const service = createService()
    service.restartCapability.set({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    service.markRequired('@xpert-ai/plugin-system-demo')

    await service.confirmAndRestart()

    expect(runtimeControlAPI.restart).toHaveBeenCalledTimes(1)
    expect(service.pending()).toMatchObject({ restartId: 'restart-system' })
    expect(service.isApplyingInBackground()).toBe(true)
    expect(service.requiresManualRestart()).toBe(false)
    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('tracks staged changes by their queued generation instead of an unrelated active restart', async () => {
    alertDialog.confirm.mockReturnValue(of(true))
    runtimeControlAPI.restart.mockReturnValue(
      of({
        accepted: true,
        restartId: 'restart-active',
        pluginGeneration: 12,
        mode: 'rolling-self-signal',
        instanceId: 'api-1',
        requestedAt: new Date().toISOString(),
        signalAfterMs: 750,
        drainTimeoutMs: 30_000
      })
    )
    const status = new Subject<Record<string, unknown>>()
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(status)
    const service = createService()
    service.restartCapability.set({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    service.markRequired('@xpert-ai/plugin-system-demo', [
      {
        scopeKey: 'system:global',
        pluginName: '@xpert-ai/plugin-system-demo',
        version: '1.0.0',
        runtimeRevision: 'runtime:system-demo-next',
        state: 'loaded'
      }
    ])

    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({
        generation: 11,
        status: 'awaiting_restart',
        requirements: service.pending()!.runtimeRequirements!
      })
    )
    await service.confirmAndRestart()
    await flushAsync()

    expect(service.pending()).toMatchObject({ generation: 12 })
    expect(service.isApplyingInBackground()).toBe(true)
    expect(service.requiresManualRestart()).toBe(false)
    expect(runtimeControlAPI.pluginConvergenceStatus).toHaveBeenCalledWith(12)
    expect(runtimeControlAPI.restartStatus).not.toHaveBeenCalled()

    status.next({
      generation: 12,
      status: 'completed',
      restartId: 'restart-follow-up',
      targetReplicaCount: 3,
      completedReplicaCount: 3,
      failedReplicaCount: 0
    })
    await flushAsync()

    expect(service.pending()).toBeNull()
  })

  it('continues tracking the active restart returned by a conflict', async () => {
    alertDialog.confirm.mockReturnValue(of(true))
    runtimeControlAPI.restart.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              statusCode: 409,
              errorCode: 'RUNTIME_RESTART_IN_PROGRESS',
              message: 'An API runtime restart is already in progress',
              restartId: 'restart-active'
            }
          })
      )
    )
    runtimeControlAPI.restartStatus.mockReturnValue(new Subject())
    const service = createService()
    service.restartCapability.set({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    service.markRequired('@xpert-ai/plugin-system-demo')

    await service.confirmAndRestart()

    await flushAsync()

    expect(service.pending()).toMatchObject({ restartId: 'restart-active' })
    expect(service.isApplyingInBackground()).toBe(true)
    expect(service.requiresManualRestart()).toBe(false)
    expect(service.lastError()).toBeNull()
    expect(runtimeControlAPI.restartStatus).toHaveBeenCalledWith('restart-active')
  })

  it('keeps staged requirements pending when an older backend returns a restart conflict', async () => {
    alertDialog.confirm.mockReturnValue(of(true))
    runtimeControlAPI.restart.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              statusCode: 409,
              errorCode: 'RUNTIME_RESTART_IN_PROGRESS',
              message: 'An API runtime restart is already in progress',
              restartId: 'restart-unrelated'
            }
          })
      )
    )
    const service = createService()
    service.restartCapability.set({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    service.markRequired('@xpert-ai/plugin-system-demo', [
      {
        scopeKey: 'system:global',
        pluginName: '@xpert-ai/plugin-system-demo',
        state: 'loaded'
      }
    ])

    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({
        generation: 11,
        status: 'awaiting_restart',
        requirements: service.pending()!.runtimeRequirements!
      })
    )
    await service.confirmAndRestart()
    await flushAsync()

    expect(service.pending()).not.toHaveProperty('restartId')
    expect(service.requiresManualRestart()).toBe(true)
    expect(runtimeControlAPI.restartStatus).not.toHaveBeenCalled()
  })
  const cachedRequirement = {
    scopeKey: 'org-1',
    pluginName: '@test/plugin',
    state: 'loaded' as const,
    version: '0.5.5'
  }
  const currentRequirement = { ...cachedRequirement, version: '0.6.1' }
  const storageKey = 'xpert:plugins:runtime-restart-required:v2:["user-1","tenant-1","organization","org-1"]'
  const failure = {
    pluginNames: ['@test/plugin'],
    requestedAt: '2026-09-09T00:00:00Z',
    runtimeRequirements: [cachedRequirement],
    error: 'Replica retired did not return after restart'
  }

  it.each(['restart', 'generation', 'legacy'])(
    'reconciles a restored %s failure against a later successful release',
    async (kind) => {
      jest.useFakeTimers()
      const record = {
        ...failure,
        ...(kind === 'restart' ? { restartId: 'old-restart' } : kind === 'generation' ? { generation: 9 } : {})
      }
      localStorage.setItem(
        kind === 'legacy' ? 'xpert:plugins:runtime-restart-required:v1' : storageKey,
        JSON.stringify(record)
      )
      runtimeControlAPI.restartStatus.mockReturnValue(of({ status: 'failed', error: failure.error }))
      runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(
        of({ generation: 9, status: 'failed', error: failure.error })
      )
      const service = createService()
      await jest.advanceTimersByTimeAsync(1000)
      expect(service.lastError()).toBe(failure.error)
      expect(service.requiresManualRestart()).toBe(true)
      if (kind === 'restart') expect(service.pending()?.restartId).toBe('old-restart')
      if (kind === 'generation') expect(service.pending()?.generation).toBe(9)
      runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
        of({ generation: 62, status: 'completed', requirements: [currentRequirement] })
      )
      await jest.advanceTimersByTimeAsync(5000)
      expect(service.pending()).toBeNull()
      expect(service.completedRevision()).toBe(1)
      expect(localStorage.getItem(storageKey)).toBeNull()
      expect(localStorage.getItem('xpert:plugins:runtime-restart-required:v1')).toBeNull()
      expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
    }
  )

  it.each(['failed', 'in_progress', 'missing-requirement', 'unavailable'])(
    'preserves unresolved legacy state when latest status is %s',
    async (kind) => {
      jest.useFakeTimers()
      localStorage.setItem(storageKey, JSON.stringify(failure))
      runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
        kind === 'unavailable'
          ? throwError(() => new HttpErrorResponse({ status: 503 }))
          : of({
              generation: 62,
              status: kind === 'failed' ? 'failed' : kind === 'in_progress' ? 'in_progress' : 'completed',
              requirements: kind === 'missing-requirement' ? [] : [currentRequirement]
            })
      )
      const service = createService()
      await jest.advanceTimersByTimeAsync(6000)
      expect(service.lastError()).toBe(failure.error)
      expect(service.requiresManualRestart()).toBe(true)
      expect(localStorage.getItem(storageKey)).not.toBeNull()
    }
  )

  it('preserves a genuinely newer unpublished installation when an older desired manifest completed', async () => {
    jest.useFakeTimers()
    const service = createService()
    service.markRequired('@test/plugin', [currentRequirement])
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({ generation: 62, status: 'completed', requirements: [cachedRequirement] })
    )
    await jest.advanceTimersByTimeAsync(5000)
    expect(service.pending()?.runtimeRequirements).toEqual([currentRequirement])
    expect(service.requiresManualRestart()).toBe(true)
  })

  it('retries a legacy failure using current server requirements and its generation fence', async () => {
    localStorage.setItem(storageKey, JSON.stringify(failure))
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({ generation: 62, status: 'failed', requirements: [currentRequirement] })
    )
    runtimeControlAPI.restart.mockReturnValue(of({ restartId: 'retry', pluginGeneration: 63 }))
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(new Subject())
    alertDialog.confirm.mockReturnValue(of(true))
    const service = createService()
    await service.confirmAndRestart()
    expect(runtimeControlAPI.restart).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedGeneration: 62,
        runtimeRequirements: [currentRequirement],
        allowDowntime: true
      })
    )
    expect(service.pending()).toMatchObject({
      generation: 63,
      runtimeRequirements: [currentRequirement],
      status: 'in_progress'
    })
  })

  it('does not restart on status lookup failure or silently clear the pending record', async () => {
    localStorage.setItem(storageKey, JSON.stringify(failure))
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })))
    alertDialog.confirm.mockReturnValue(of(true))
    const service = createService()
    await service.confirmAndRestart()
    expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
    expect(service.pending()?.runtimeRequirements).toEqual([cachedRequirement])
    expect(service.requiresManualRestart()).toBe(true)
  })

  it('keeps state isolated across users and ignores late responses from the previous identity', async () => {
    localStorage.setItem(storageKey, JSON.stringify(failure))
    const response = new Subject<IPluginRuntimeSnapshot>()
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(response)
    const service = createService()
    user.next({ id: 'user-2', tenantId: 'tenant-2', role: { name: RolesEnum.SUPER_ADMIN } })
    TestBed.tick()
    expect(service.pending()).toBeNull()
    service.markRequired('@test/new')
    response.next({ generation: 62, status: 'completed', requirements: [currentRequirement] })
    await flushAsync()
    expect(service.pending()?.pluginNames).toEqual(['@test/new'])
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(failure)
    expect(
      localStorage.getItem('xpert:plugins:runtime-restart-required:v2:["user-2","tenant-2","organization","org-1"]')
    ).toContain('@test/new')
  })

  it('does not adopt unscoped legacy state in an unauthorized tenant', () => {
    localStorage.setItem('xpert:plugins:runtime-restart-required:v1', JSON.stringify(failure))
    runtimeControlAPI.restartCapability.mockReturnValue(
      of({ allowed: false, mode: 'rolling-self-signal', reason: 'default-tenant-required' })
    )
    const service = createService()
    expect(service.pending()).toBeNull()
    expect(runtimeControlAPI.pluginRuntimeSnapshot).not.toHaveBeenCalled()
    expect(localStorage.getItem('xpert:plugins:runtime-restart-required:v1')).not.toBeNull()
  })
  it('checks authoritative state when returning to an old tab', async () => {
    localStorage.setItem(storageKey, JSON.stringify(failure))
    const service = createService()
    await flushAsync()
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({ generation: 62, status: 'completed', requirements: [currentRequirement] })
    )
    window.dispatchEvent(new Event('focus'))
    await flushAsync()
    expect(service.pending()).toBeNull()
    expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
  })

  it('keeps fresh unpublished requirements separate from older failed requirements', async () => {
    jest.useFakeTimers()
    localStorage.setItem(storageKey, JSON.stringify(failure))
    const service = createService()
    const fresh = { ...currentRequirement, pluginName: '@test/new', version: '1.0.0' }
    service.markRequired(fresh.pluginName, [fresh])
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({ generation: 62, status: 'completed', requirements: [currentRequirement] })
    )
    await jest.advanceTimersByTimeAsync(5000)
    expect(service.pending()).not.toBeNull()
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({ generation: 63, status: 'completed', requirements: [currentRequirement, fresh] })
    )
    await jest.advanceTimersByTimeAsync(5000)
    expect(service.pending()).toBeNull()
  })

  it('does not treat a legacy unpublished change as superseded by a different version', async () => {
    localStorage.setItem(
      'xpert:plugins:runtime-restart-required:v1',
      JSON.stringify({
        pluginNames: ['@test/plugin'],
        requestedAt: failure.requestedAt,
        runtimeRequirements: [currentRequirement]
      })
    )
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({ generation: 62, status: 'completed', requirements: [cachedRequirement] })
    )
    const service = createService()
    await flushAsync()
    expect(service.pending()?.unpublishedRequirements).toEqual([currentRequirement])
    expect(service.requiresManualRestart()).toBe(true)
  })

  it('switches persisted state with the active organization', () => {
    localStorage.setItem(storageKey, JSON.stringify(failure))
    const service = createService()
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-2' })
    TestBed.tick()
    expect(service.pending()).toBeNull()
    service.markRequired('@test/org-2')
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' })
    TestBed.tick()
    expect(service.pending()?.pluginNames).toEqual(['@test/plugin'])
    expect(
      localStorage.getItem('xpert:plugins:runtime-restart-required:v2:["user-1","tenant-1","organization","org-2"]')
    ).toContain('@test/org-2')
  })
  it('retains in-memory work when persistence fails and clears the diagnostic after a successful write', () => {
    const service = createService()
    const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    service.markRequired('@test/first', [currentRequirement])
    expect(service.pending()?.pluginNames).toEqual(['@test/first'])
    expect(service.requiresManualRestart()).toBe(true)
    expect(service.storageIssues().pending).toBe('unavailable')
    expect(localStorage.getItem(storageKey)).toBeNull()
    write.mockRestore()
    service.markRequired('@test/second')
    expect(service.pending()?.pluginNames).toEqual(['@test/first', '@test/second'])
    expect(service.storageIssues().pending).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(service.pending())
  })

  it('keeps failed migration usable in this session and recoverable on the next reload', async () => {
    const legacyKey = 'xpert:plugins:runtime-restart-required:v1'
    localStorage.setItem(legacyKey, JSON.stringify(failure))
    const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    const service = createService()
    await flushAsync()
    expect(service.pending()).toEqual(failure)
    expect(service.requiresManualRestart()).toBe(true)
    expect(service.storageIssues().pending).toBe('unavailable')
    expect(localStorage.getItem(legacyKey)).toBe(JSON.stringify(failure))
    expect(localStorage.getItem(storageKey)).toBeNull()
    write.mockRestore()
    // Switching away and back reloads the same scoped state through the coordinator.
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-2' })
    runtimeControlAPI.restartCapability.mockReturnValue(
      of({ allowed: false, mode: 'rolling-self-signal', reason: 'default-tenant-required' })
    )
    TestBed.tick()
    runtimeControlAPI.restartCapability.mockReturnValue(
      of({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    )
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' })
    TestBed.tick()
    await flushAsync()
    expect(service.pending()).toEqual(failure)
    expect(service.storageIssues().pending).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(failure)
    expect(localStorage.getItem(legacyKey)).toBeNull()
  })

  it('exposes invalid cache without overwriting it with legacy history', () => {
    localStorage.setItem(storageKey, '{broken')
    localStorage.setItem('xpert:plugins:runtime-restart-required:v1', JSON.stringify(failure))
    const service = createService()
    expect(service.pending()).toBeNull()
    expect(service.storageIssues().pending).toBe('invalid')
    expect(localStorage.getItem(storageKey)).toBe('{broken')
    expect(localStorage.getItem('xpert:plugins:runtime-restart-required:v1')).toBe(JSON.stringify(failure))
    expect(runtimeControlAPI.restart).not.toHaveBeenCalled()
  })

  it('does not attach a delayed restart response to a newer unpublished change', async () => {
    localStorage.setItem(storageKey, JSON.stringify(failure))
    runtimeControlAPI.pluginRuntimeSnapshot.mockReturnValue(
      of({ generation: 62, status: 'failed', requirements: [currentRequirement] })
    )
    const restart = new Subject<{ restartId: string; pluginGeneration: number }>()
    runtimeControlAPI.restart.mockReturnValue(restart)
    alertDialog.confirm.mockReturnValue(of(true))
    const service = createService()
    const requesting = service.confirmAndRestart()
    await flushAsync()
    expect(runtimeControlAPI.restart).toHaveBeenCalledTimes(1)
    const fresh = { ...currentRequirement, pluginName: '@test/new', version: '1.0.0' }
    service.markRequired(fresh.pluginName, [fresh])
    restart.next({ restartId: 'retry', pluginGeneration: 63 })
    await requesting
    expect(service.pending()?.generation).toBeUndefined()
    expect(service.pending()?.unpublishedRequirements).toEqual([fresh])
    expect(service.requiresManualRestart()).toBe(true)
  })
})

async function flushAsync() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
