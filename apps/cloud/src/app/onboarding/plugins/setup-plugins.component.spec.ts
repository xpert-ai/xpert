import { TestBed } from '@angular/core/testing'
import { DOCUMENT } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { of, throwError } from 'rxjs'
import type { SetupPluginsResponse } from '@xpert-ai/contracts'
import { SetupPluginsService } from '../../@core/services/setup-plugins.service'
import { SetupPluginsComponent } from './setup-plugins.component'

jest.mock('../../@core', () => ({ getErrorMessage: (error: Error) => error.message }))

describe('SetupPluginsComponent final step', () => {
  const api = { status: jest.fn(), start: jest.fn() }
  const assign = jest.fn()
  const response = (phase: SetupPluginsResponse['progress']['phase']): SetupPluginsResponse => ({
    automaticRestart: true,
    progress: { phase, items: [], updatedAt: '' }
  })
  beforeEach(() => {
    jest.useFakeTimers()
    jest.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [
        { provide: SetupPluginsService, useValue: api },
        { provide: DOCUMENT, useValue: { defaultView: { location: { assign } } } }
      ]
    })
    api.status.mockReturnValue(of(response('idle')))
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
  })

  it('skips directly into the organization when requested', async () => {
    const component = TestBed.runInInjectionContext(() => new SetupPluginsComponent())
    await jest.advanceTimersByTimeAsync(0)
    expect(component.selected().size).toBe(0)
    api.start.mockReturnValue(of(response('completed')))
    void component.start(true)
    await jest.advanceTimersByTimeAsync(1500)
    expect(api.start).toHaveBeenCalledWith([], false)
    expect(assign).toHaveBeenCalledWith('/')
  })

  it('tolerates restart disconnections and redirects only after activation completes', async () => {
    const component = TestBed.runInInjectionContext(() => new SetupPluginsComponent())
    await jest.advanceTimersByTimeAsync(0)
    api.start.mockReturnValue(of(response('restarting')))
    api.status
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
      .mockReturnValueOnce(of(response('restarting')))
      .mockReturnValueOnce(of(response('completed')))
    void component.start()
    await jest.advanceTimersByTimeAsync(2000)
    expect(component.disconnected()).toBe(true)
    expect(assign).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(2000)
    expect(assign).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(3500)
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it('resumes a persisted installation after the setup page is reopened', async () => {
    const installing = response('installing')
    installing.progress.items = [
      { packageName: 'saved-plugin', title: 'Saved', status: 'pending', runtimeRequirements: [] }
    ]
    api.status.mockReturnValueOnce(of(installing)).mockReturnValue(of(response('completed')))
    api.start.mockReturnValueOnce(of(installing)).mockReturnValue(of(response('completed')))
    TestBed.runInInjectionContext(() => new SetupPluginsComponent())
    await jest.advanceTimersByTimeAsync(3500)
    expect(api.start).toHaveBeenCalledWith(['saved-plugin'], false)
    expect(assign).toHaveBeenCalledWith('/')
  })

  it('resumes an interrupted installation while the setup page stays open', async () => {
    const component = TestBed.runInInjectionContext(() => new SetupPluginsComponent())
    await jest.advanceTimersByTimeAsync(0)
    const installing = response('installing')
    installing.progress.items = [
      { packageName: 'saved-plugin', title: 'Saved', status: 'installing', runtimeRequirements: [] }
    ]
    installing.progress.defaultAgentPlugins = { status: 'pending' }
    api.start
      .mockReturnValueOnce(of(installing))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
      .mockReturnValueOnce(of(response('completed')))
    void component.start()
    await jest.advanceTimersByTimeAsync(2000)
    expect(component.disconnected()).toBe(true)
    expect(assign).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(3500)
    expect(api.start).toHaveBeenLastCalledWith(['saved-plugin'], true)
    expect(assign).toHaveBeenCalledTimes(1)
  })
  it('includes default Agent imports even when no native plugin is selected', async () => {
    const component = TestBed.runInInjectionContext(() => new SetupPluginsComponent())
    await jest.advanceTimersByTimeAsync(0)
    expect(component.importDefaults()).toBe(true)
    api.start.mockReturnValue(of(response('completed')))
    void component.start()
    await jest.advanceTimersByTimeAsync(1500)
    expect(api.start).toHaveBeenCalledWith([], true)
    expect(assign).toHaveBeenCalledWith('/')
  })
})
