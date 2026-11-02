import { TestBed } from '@angular/core/testing'
import { Router, NavigationError } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ZardAlertDialogService, ZardToastService } from '@xpert-ai/headless-ui'
import { of, Subject } from 'rxjs'
import { ChatkitLifecycleService } from '../chatkit-lifecycle.service'
import { PageLeaveService } from '../page-leave.service'
import { WEB_UPDATE_WINDOW, WebUpdateService } from './web-update.service'

jest.mock('@cloud/web-release', () => ({ WEB_RELEASE: { buildId: 'A', version: '3.26.2' } }))
jest.mock('@cloud/environments/environment', () => ({ environment: { production: true } }))
jest.mock('@xpert-ai/headless-ui', () => ({ ZardAlertDialogService: class {}, ZardToastService: class {} }))

describe('Web update browser integration', () => {
  let service: WebUpdateService
  let fetchRelease: jest.Mock
  let navigate: jest.Mock
  let confirm: jest.Mock
  let prepareLeave: jest.Mock
  let pageLeave: jest.Mock
  let info: jest.Mock
  let error: jest.Mock
  let dismiss: jest.Mock
  let events: Subject<unknown>
  const browserEvents = new EventTarget()
  beforeEach(() => {
    sessionStorage.clear()
    events = new Subject()
    fetchRelease = jest.fn(async () => ({ ok: true, json: async () => ({ buildId: 'B', version: '3.26.2' }) }))
    navigate = jest.fn()
    confirm = jest.fn(() => of(true))
    prepareLeave = jest.fn(async () => true)
    pageLeave = jest.fn(async () => true)
    dismiss = jest.fn()
    info = jest.fn(() => ({ id: 'notice', dismiss }))
    error = jest.fn()
    TestBed.configureTestingModule({
      providers: [
        WebUpdateService,
        { provide: Router, useValue: { events } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: ZardToastService, useValue: { info, error } },
        { provide: ZardAlertDialogService, useValue: { confirm } },
        { provide: ChatkitLifecycleService, useValue: { prepareLeave } },
        { provide: PageLeaveService, useValue: { prepareLeave: pageLeave } },
        {
          provide: WEB_UPDATE_WINDOW,
          useValue: {
            fetch: fetchRelease,
            sessionStorage,
            navigator: {},
            location: { href: 'https://xpert.test/chat?a=1#thread', origin: 'https://xpert.test', replace: navigate },
            history: { state: null, replaceState: jest.fn() },
            addEventListener: browserEvents.addEventListener.bind(browserEvents),
            removeEventListener: browserEvents.removeEventListener.bind(browserEvents)
          }
        }
      ]
    })
    service = TestBed.inject(WebUpdateService)
  })
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
  })

  it('uses a persistent bottom-left notice; dismissal preserves About update state', async () => {
    await service.check()
    const options = info.mock.calls[0][1]
    expect(options).toMatchObject({ position: 'bottom-left', duration: Infinity, closeButton: true })
    options.onDismiss()
    expect(service.available()).toBe(true)
    expect(service.state().dismissed).toBe(true)
    await service.check()
    expect(info).toHaveBeenCalledTimes(1)
    expect(fetchRelease.mock.calls[0][1].cache).toBe('no-store')
  })

  it('confirms saving and leave readiness, preserves URL and authentication storage', async () => {
    sessionStorage.setItem('unrelated', 'keep')
    await service.check()
    await service.update()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(prepareLeave).toHaveBeenCalledTimes(1)
    expect(pageLeave).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('https://xpert.test/chat?a=1&_xpert_update=B#thread')
    expect(sessionStorage.getItem('unrelated')).toBe('keep')
  })

  it('does not dismiss the notice or reload when confirmation is cancelled', async () => {
    confirm.mockReturnValue(of(false))
    await service.check()
    const preventDefault = jest.fn()
    info.mock.calls[0][1].action.onClick({ preventDefault })
    await Promise.resolve()
    expect(preventDefault).toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(prepareLeave).not.toHaveBeenCalled()
    expect(service.state().dismissed).toBe(false)
  })

  it.each(['denied', 'throws'])('blocks reload when leave check %s', async (mode) => {
    if (mode === 'throws') prepareLeave.mockRejectedValue(new Error('Save failed'))
    else prepareLeave.mockResolvedValue(false)
    await service.check()
    await service.update()
    expect(navigate).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  it('honors the current editor leave check before asking ChatKit to save', async () => {
    pageLeave.mockResolvedValue(false)
    await service.check()
    await service.update()
    expect(prepareLeave).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows checking/failure even when a previous refresh was incomplete', () => {
    service.state.set({ status: 'checking', latest: null, incomplete: true, dismissed: false })
    expect(service.statusKey()).toBe('Checking')
    service.state.update((state) => ({ ...state, status: 'failed' }))
    expect(service.statusKey()).toBe('CheckFailed')
  })

  it('deduplicates update clicks and aborts refresh on failed recheck', async () => {
    let resolve: (result: boolean) => void = () => undefined
    prepareLeave.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    await service.check()
    const first = service.update()
    await Promise.resolve()
    await service.update()
    expect(confirm).toHaveBeenCalledTimes(1)
    fetchRelease.mockResolvedValue({ ok: false })
    resolve(true)
    await first
    expect(navigate).not.toHaveBeenCalled()
    expect(service.state().status).toBe('failed')
  })

  it('checks on startup, interval, returning online/visible and route failures', async () => {
    jest.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    service.start()
    await service.check()
    expect(fetchRelease).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(60000)
    expect(fetchRelease).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await jest.advanceTimersByTimeAsync(60000)
    expect(fetchRelease).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await service.check()
    browserEvents.dispatchEvent(new Event('online'))
    await service.check()
    events.next(new NavigationError(1, '/studio', new Error('Chunk missing')))
    await service.check()
    expect(fetchRelease).toHaveBeenCalledTimes(5)
  })
})
