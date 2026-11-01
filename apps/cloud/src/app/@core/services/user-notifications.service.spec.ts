import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, Subject } from 'rxjs'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { Store } from '../state'
import { UserNotificationsService } from './user-notifications.service'
import { ChatConversationService } from './chat-conversation.service'

let mockStream = new Subject<{ data: string }>()
jest.mock('./notification-stream-coordinator', () => ({
  coordinateNotificationStream: (_identity: string, start: (publish: () => void) => () => void) =>
    start(() => undefined)
}))
jest.mock('./fetch-event-source', () => ({ injectFetchEventSource: () => () => mockStream }))
async function advance(milliseconds = 0) {
  jest.advanceTimersByTime(milliseconds)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
const id = 'a1111111-1111-4111-8111-111111111111'
const snapshot = () => ({
  supported: true,
  version: '1',
  announcements: [
    {
      id,
      title: 'Maintenance',
      body: 'Hello',
      category: 'maintenance',
      severity: 'important',
      clients: ['web', 'desktop'],
      status: 'published',
      revision: 1,
      startsAt: '2026-10-01T00:00:00Z',
      expiresAt: null,
      createdAt: '2026-10-01T00:00:00Z',
      dismissedAt: null,
      action: null
    }
  ],
  notifications: [],
  hasMoreAnnouncements: false,
  hasMoreNotifications: false
})

describe('User notification client isolation and recovery', () => {
  const refreshUnread = jest.fn()
  let service: UserNotificationsService, http: HttpTestingController
  let user: BehaviorSubject<{ id: string; tenantId: string }>
  let scope: BehaviorSubject<{ level: RequestScopeLevel; organizationId?: string }>
  beforeEach(() => {
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    mockStream = new Subject<{ data: string }>()
    refreshUnread.mockClear()
    jest.useFakeTimers()
    localStorage.clear()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    user = new BehaviorSubject({ id: 'user-a', tenantId: 'tenant-a' })
    scope = new BehaviorSubject<{ level: RequestScopeLevel; organizationId?: string }>({
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: 'org-a'
    })
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        UserNotificationsService,
        { provide: ChatConversationService, useValue: { refreshUnread } },
        { provide: Store, useValue: { user$: user, activeScope$: scope } }
      ]
    })
    service = TestBed.inject(UserNotificationsService)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => {
    service.stop()
    http.verify()
    jest.restoreAllMocks()
    jest.useRealTimers()
    localStorage.clear()
  })
  it('ignores heartbeat and invalid hints, and reconciles a valid change hint', async () => {
    service.start()
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    mockStream.next({ data: JSON.stringify({ schemaVersion: 1, type: 'heartbeat' }) })
    mockStream.next({ data: 'invalid' })
    await advance(40000)
    http.expectNone((request) => request.url.endsWith('/sync'))
    expect(refreshUnread).not.toHaveBeenCalled()
    const previousSync = Date.now()
    mockStream.next({ data: JSON.stringify({ schemaVersion: 1, type: 'sync.required', eventId: id }) })
    expect(refreshUnread).toHaveBeenCalledTimes(1)
    expect(service.canShowLiveHint(previousSync)).toBe(true)
    expect(service.canShowLiveHint(0)).toBe(false)
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
  })
  it('ignores an old-account response and reloads after organization switches', async () => {
    service.start()
    await advance(251)
    const old = http.expectOne((request) => request.url.endsWith('/sync'))
    user.next({ id: 'user-b', tenantId: 'tenant-b' })
    await advance(251)
    const current = http.expectOne((request) => request.url.endsWith('/sync'))
    old.flush(snapshot())
    await advance()
    expect(service.snapshot()).toBeNull()
    current.flush({ ...snapshot(), announcements: [] })
    await advance()
    expect(service.snapshot().announcements).toHaveLength(0)
    scope.next({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-b' })
    await advance(251)
    expect(service.snapshot()).toBeNull()
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    expect(service.snapshot().announcements).toHaveLength(1)
  })
  it('keeps failed dismissals hidden and never retries them as a different user', async () => {
    service.start()
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    service.dismiss(id)
    expect(service.snapshot().announcements).toHaveLength(0)
    expect(Object.keys(localStorage).some((key) => key.endsWith(id))).toBe(true)
    await advance(251)
    http
      .expectOne((request) => request.url.endsWith('/dismissal'))
      .flush({}, { status: 503, statusText: 'Unavailable' })
    await advance()
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    expect(service.snapshot().announcements).toHaveLength(0)
    user.next({ id: 'user-b', tenantId: 'tenant-b' })
    await advance(251)
    http.expectNone((request) => request.url.endsWith('/dismissal'))
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    expect(service.snapshot().announcements).toHaveLength(1)
    user.next({ id: 'user-a', tenantId: 'tenant-a' })
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/dismissal')).flush({ dismissed: true })
    await advance()
    http.expectOne((request) => request.url.endsWith('/sync')).flush({ ...snapshot(), announcements: [] })
    await advance()
    expect(Object.keys(localStorage).some((key) => key.endsWith(id))).toBe(false)
  })
  it('releases the stream while hidden and reconciles on visibility and bfcache restoration', async () => {
    service.start()
    service.start()
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    expect(mockStream.observers).toHaveLength(1)
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mockStream.observers).toHaveLength(0)
    await advance(180000)
    http.expectNone((request) => request.url.endsWith('/sync'))
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mockStream.observers).toHaveLength(1)
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    window.dispatchEvent(new Event('pagehide'))
    expect(mockStream.observers).toHaveLength(0)
    await advance(180000)
    http.expectNone((request) => request.url.endsWith('/sync'))
    window.dispatchEvent(new Event('pageshow'))
    expect(mockStream.observers).toHaveLength(1)
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
  })
  it('cancels a pending reconnect when hidden and reconnects on return', async () => {
    service.start()
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    mockStream.error(new Error('Disconnected'))
    mockStream = new Subject<{ data: string }>()
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await advance(31000)
    expect(mockStream.observers).toHaveLength(0)
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mockStream.observers).toHaveLength(1)
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
  })
  it('never opens a stream or polls when started in a hidden page', async () => {
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    service.start()
    await advance(180000)
    expect(mockStream.observers).toHaveLength(0)
    http.expectNone((request) => request.url.endsWith('/sync'))
  })
  it('stops polling an old server and resumes when the identity changes', async () => {
    service.start()
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush({}, { status: 404, statusText: 'Not found' })
    await advance(180000)
    http.expectNone((request) => request.url.endsWith('/sync'))
    user.next({ id: 'user-b', tenantId: 'tenant-b' })
    await advance(251)
    http.expectOne((request) => request.url.endsWith('/sync')).flush(snapshot())
    await advance()
    expect(service.snapshot().announcements).toHaveLength(1)
  })
})
