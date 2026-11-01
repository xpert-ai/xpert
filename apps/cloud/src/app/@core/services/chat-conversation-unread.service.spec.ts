import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { BehaviorSubject, exhaustMap, Subject, catchError, of } from 'rxjs'
import { Store } from '@cloud/app/@core/state'
import { ChatConversationService } from './chat-conversation.service'

describe('ChatConversationService unread polling', () => {
  let http: HttpTestingController
  let service: ChatConversationService
  let organization: BehaviorSubject<string>

  beforeEach(() => {
    organization = new BehaviorSubject('org-1')
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: Store, useValue: { selectOrganizationId: () => organization } }]
    })
    http = TestBed.inject(HttpTestingController)
    service = TestBed.inject(ChatConversationService)
  })

  afterEach(() => http.verify())

  it('completes each HTTP request so exhaustMap accepts subsequent poll and read-state events', () => {
    const refresh = new Subject<void>()
    const summaries = jest.fn()
    const subscription = refresh.pipe(exhaustMap(() => service.getUnreadByXperts(['assistant']))).subscribe(summaries)
    refresh.next()
    const first = http.expectOne('/api/chat-conversation/unread/xperts')
    expect(first.request.body).toEqual({ xpertIds: ['assistant'] })
    refresh.next()
    http.expectNone('/api/chat-conversation/unread/xperts')
    first.flush([])
    organization.next('org-2')
    http.expectNone('/api/chat-conversation/unread/xperts')
    refresh.next()
    http.expectOne('/api/chat-conversation/unread/xperts').flush([])
    expect(summaries).toHaveBeenCalledTimes(2)
    subscription.unsubscribe()
  })

  it('cancels a stalled request after 15 seconds and allows the next poll to recover', fakeAsync(() => {
    const refresh = new Subject<void>()
    const failure = jest.fn(() => of([]))
    const subscription = refresh
      .pipe(exhaustMap(() => service.getUnreadByXperts(['assistant'], 'explicit-org').pipe(catchError(failure))))
      .subscribe()
    refresh.next()
    const pending = http.expectOne('/api/chat-conversation/unread/xperts?organizationId=explicit-org')
    tick(14_999)
    expect(pending.cancelled).toBe(false)
    tick(1)
    expect(pending.cancelled).toBe(true)
    expect(failure).toHaveBeenCalledTimes(1)
    refresh.next()
    http.expectOne('/api/chat-conversation/unread/xperts?organizationId=explicit-org').flush([])
    subscription.unsubscribe()
  }))
})
