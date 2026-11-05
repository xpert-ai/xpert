import { HttpClient } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { AIPermissionsEnum, AppPlatformStatus } from '@xpert-ai/contracts'
import { ZardToastService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, Subject, of, throwError } from 'rxjs'
import { Store } from '../state'
import { AppPlatformService } from './app-platform.service'
import { XpertAPIService } from './xpert.service'

describe('optional App recovery in the native website', () => {
  const status = (): AppPlatformStatus => ({
    mode: 'managed-apps',
    branding: { name: 'Fixture' },
    platformKey: 'fixture',
    version: 1,
    organizationId: 'organization',
    home: 'main',
    ready: true,
    apps: [
      { key: 'main', required: true, status: 'ready', entries: [{ key: 'main', id: 'assistant', title: 'Main' }] },
      { key: 'optional', required: false, status: 'failed', entries: [] }
    ]
  })
  const permission = { permission: AIPermissionsEnum.CHAT_VIEW, enabled: true }
  const user = { id: 'user', role: { rolePermissions: [permission] } }
  const user$ = new BehaviorSubject(user)
  const store = { user, user$ }
  const notice = { dismiss: jest.fn() }
  const toast = {
    warning: jest.fn(
      (_message: Parameters<ZardToastService['warning']>[0], _options?: Parameters<ZardToastService['warning']>[1]) =>
        notice
    ),
    info: jest.fn(),
    error: jest.fn()
  }
  const http = { get: jest.fn(), post: jest.fn() }
  const assistants = { refresh: jest.fn() }
  let service: AppPlatformService
  beforeEach(() => {
    jest.clearAllMocks()
    permission.enabled = true
    store.user = user
    user$.next(user)
    http.get.mockReturnValue(of(status()))
    TestBed.configureTestingModule({
      providers: [
        AppPlatformService,
        { provide: HttpClient, useValue: http },
        { provide: Store, useValue: store },
        { provide: ZardToastService, useValue: toast },
        { provide: XpertAPIService, useValue: assistants },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    })
    service = TestBed.inject(AppPlatformService)
  })
  afterEach(() => TestBed.resetTestingModule())

  it('shares deployment presentation across concurrent and later navigations', async () => {
    const response = { mode: 'managed-apps', branding: { name: 'Fixture' } } as const
    const pending = new Subject<typeof response>()
    http.get.mockReturnValue(pending)
    const first = service.presentation()
    const second = service.presentation()
    pending.next(response)
    pending.complete()
    expect(await Promise.all([first, second])).toEqual([response, response])
    expect(await service.presentation()).toEqual(response)
    expect(service.branding()).toEqual(response.branding)
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('retries a failed presentation lookup', async () => {
    http.get.mockReturnValueOnce(throwError(() => new Error('Offline'))).mockReturnValue(of({ mode: 'standard' }))
    await expect(service.presentation()).rejects.toThrow('Offline')
    await expect(service.presentation()).resolves.toEqual({ mode: 'standard' })
    expect(http.get).toHaveBeenCalledTimes(2)
  })

  it('shows a single persistent retry notice without changing navigation or successful entries', async () => {
    await service.refresh()
    await service.refresh()
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(toast.warning).toHaveBeenCalledWith(
      'AppPlatform.OptionalUnavailable',
      expect.objectContaining({
        duration: Number.POSITIVE_INFINITY,
        action: expect.objectContaining({ onClick: expect.any(Function) })
      })
    )
    expect(service.status()?.apps[0].entries).toHaveLength(1)
    expect(assistants.refresh).toHaveBeenCalledTimes(1)
  })
  it('does not show a retry action without the chat role permission', async () => {
    permission.enabled = false
    await service.refresh()
    expect(toast.warning).not.toHaveBeenCalled()
  })
  it('clears the failure notice after recovery, and permits a new failure notice', async () => {
    await service.refresh()
    const ready = status()
    ready.apps[1].status = 'ready'
    http.get.mockReturnValue(of(ready))
    await service.refresh()
    expect(notice.dismiss).toHaveBeenCalledTimes(1)
    http.get.mockReturnValue(of(status()))
    await service.refresh()
    expect(toast.warning).toHaveBeenCalledTimes(2)
  })
  it('requests scoped recovery with an empty body and does not expose a transport error', async () => {
    await service.refresh()
    http.post.mockReturnValue(throwError(() => Error('private provider diagnostics')))
    const action = toast.warning.mock.calls[0][1]?.action
    if (!action) throw new Error('Retry action is missing')
    action.onClick(new MouseEvent('click'))
    await Promise.resolve()
    await Promise.resolve()
    expect(http.post).toHaveBeenCalledWith(expect.stringContaining('/app-platform/retry'), {})
    expect(toast.error).toHaveBeenCalledWith('AppPlatform.Unavailable')
  })
  it('refreshes the existing assistant sidebar after asynchronous recovery', async () => {
    jest.useFakeTimers()
    try {
      await service.refresh()
      http.post.mockReturnValue(of(status()))
      const ready = status()
      ready.apps[1] = {
        ...ready.apps[1],
        status: 'ready',
        entries: [{ key: 'assistant', id: 'optional-entry', title: 'Optional' }]
      }
      http.get.mockReturnValue(of(ready))
      const action = toast.warning.mock.calls[0][1]?.action
      if (!action) throw new Error('Retry action is missing')
      action.onClick(new MouseEvent('click'))
      await jest.advanceTimersByTimeAsync(3000)
      expect(service.status()?.apps[1].status).toBe('ready')
      expect(assistants.refresh).toHaveBeenCalledTimes(2)
      expect(notice.dismiss).toHaveBeenCalled()
      expect(http.post).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })
  it('clears the previous account and rejects a late response after switching accounts', async () => {
    await service.refresh()
    const pending = new Subject<AppPlatformStatus>()
    http.get.mockReturnValue(pending)
    const request = service.refresh()
    const rejected = expect(request).rejects.toThrow('Application account changed')
    store.user = { ...user, id: 'other' }
    user$.next(store.user)
    expect(service.status()).toBeNull()
    expect(notice.dismiss).toHaveBeenCalled()
    pending.next(status())
    pending.complete()
    await rejected
    expect(service.status()).toBeNull()
  })
})
