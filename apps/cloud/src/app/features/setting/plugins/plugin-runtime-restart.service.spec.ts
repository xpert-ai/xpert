import { Dialog } from '@angular/cdk/dialog'
import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { RuntimeControlAPIService, Store } from '@cloud/app/@core/state'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { TranslateService } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import { PluginRuntimeRestartService } from './plugin-runtime-restart.service'

describe('PluginRuntimeRestartService', () => {
  const runtimeControlAPI = {
    restartCapability: jest.fn(() => of({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })),
    pluginConvergenceStatus: jest.fn(),
    restartStatus: jest.fn(),
    restart: jest.fn(),
    readiness: jest.fn()
  }
  const store = {
    user$: of(null),
    activeScope: { organizationId: 'org-1' },
    selectActiveScope: jest.fn(() => of({ organizationId: 'org-1' }))
  }
  const dialog = { open: jest.fn() }
  const alertDialog = { confirm: jest.fn() }

  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
    runtimeControlAPI.restartCapability.mockReturnValue(
      of({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    )
    TestBed.configureTestingModule({
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

  afterEach(() => {
    jest.useRealTimers()
    TestBed.resetTestingModule()
    localStorage.clear()
  })

  it('keeps automatic convergence durable until the backend generation completes', async () => {
    const status = new Subject<Record<string, unknown>>()
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(status)
    const service = TestBed.inject(PluginRuntimeRestartService)

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
    expect(localStorage.getItem('xpert:plugins:runtime-restart-required:v1')).toBeNull()
    expect(localStorage.getItem('xpert:plugins:runtime-convergence:v1')).not.toBeNull()

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
    expect(localStorage.getItem('xpert:plugins:runtime-convergence:v1')).toBeNull()
  })

  it('keeps automatic convergence in progress beyond six minutes until the backend completes', async () => {
    jest.useFakeTimers()
    const status = new Subject<Record<string, unknown>>()
    runtimeControlAPI.pluginConvergenceStatus.mockReturnValue(status)
    const service = TestBed.inject(PluginRuntimeRestartService)

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
    const service = TestBed.inject(PluginRuntimeRestartService)
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
    const service = TestBed.inject(PluginRuntimeRestartService)

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
    const service = TestBed.inject(PluginRuntimeRestartService)

    service.trackPluginConvergence({ generation: 10 }, '@xpert-ai/plugin-openrouter')
    await flushAsync()

    expect(service.requiresManualRestart()).toBe(true)
    expect(service.lastError()).toBe('Plugin openrouter loaded 0.0.2 instead of 0.1.0')
  })

  it('preserves the backend failure reason when a background manual restart fails', async () => {
    localStorage.setItem(
      'xpert:plugins:runtime-restart-required:v1',
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

    const service = TestBed.inject(PluginRuntimeRestartService)
    await flushAsync()

    expect(service.requiresManualRestart()).toBe(true)
    expect(service.lastError()).toBe('Replica api-3 did not return after restart')
  })

  it('keeps a manual background restart in progress beyond six minutes until the backend completes', async () => {
    jest.useFakeTimers()
    localStorage.setItem(
      'xpert:plugins:runtime-restart-required:v1',
      JSON.stringify({
        pluginNames: ['@xpert-ai/plugin-system-demo'],
        requestedAt: new Date().toISOString(),
        restartId: 'restart-long-running'
      })
    )
    const status = new Subject<Record<string, unknown>>()
    runtimeControlAPI.restartStatus.mockReturnValue(status)

    const service = TestBed.inject(PluginRuntimeRestartService)
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
    const service = TestBed.inject(PluginRuntimeRestartService)
    service.restartCapability.set({ allowed: true, mode: 'rolling-self-signal', reason: 'allowed' })
    service.markRequired('@xpert-ai/plugin-system-demo')

    await service.confirmAndRestart()

    expect(runtimeControlAPI.restart).toHaveBeenCalledTimes(1)
    expect(service.pending()).toMatchObject({ restartId: 'restart-system' })
    expect(service.isApplyingInBackground()).toBe(true)
    expect(service.requiresManualRestart()).toBe(false)
    expect(dialog.open).not.toHaveBeenCalled()
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
    const service = TestBed.inject(PluginRuntimeRestartService)
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
})

async function flushAsync() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
