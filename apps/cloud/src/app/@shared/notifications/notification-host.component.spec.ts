import { signal } from '@angular/core'
import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { Announcement, NotificationSnapshot } from '@xpert-ai/contracts'
import { UserNotificationsService } from '../../@core/services/user-notifications.service'
import { NotificationHostComponent } from './notification-host.component'

jest.mock('../../@core/services/user-notifications.service', () => ({ UserNotificationsService: class {} }))

const item: Announcement = {
  id: 'a1111111-1111-4111-8111-111111111111',
  title: 'Maintenance',
  body: 'A long announcement\n'.repeat(30),
  category: 'maintenance',
  severity: 'important',
  clients: ['web'],
  status: 'published',
  revision: 1,
  startsAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  dismissedAt: null,
  action: null
}
const snapshot = (announcements: Announcement[]): NotificationSnapshot => ({
  supported: true,
  version: '1',
  announcements,
  notifications: [],
  hasMoreAnnouncements: false,
  hasMoreNotifications: false
})

describe('Announcement notices', () => {
  const service = {
    identity: signal('user-a'),
    snapshot: signal<NotificationSnapshot | null>(null),
    openRequested: signal(0),
    start: jest.fn(),
    stop: jest.fn(),
    scheduleRefresh: jest.fn(),
    dismiss: jest.fn(),
    announcement: jest.fn<Promise<Announcement>, [string]>(),
    canShowLiveHint: () => false,
    open: jest.fn()
  }
  const dialog = { open: jest.fn(), openDialogs: [] }
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    service.identity.set('user-a')
    service.snapshot.set(snapshot([item]))
    service.openRequested.set(0)
    service.announcement.mockResolvedValue(item)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    TestBed.configureTestingModule({
      imports: [NotificationHostComponent, TranslateModule.forRoot()],
      providers: [
        { provide: UserNotificationsService, useValue: service },
        { provide: Dialog, useValue: dialog },
        { provide: Router, useValue: { url: '/chat' } }
      ]
    })
  })
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
  })
  async function show() {
    const fixture = TestBed.createComponent(NotificationHostComponent)
    fixture.detectChanges()
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    fixture.detectChanges()
    return fixture
  }
  it('shows without opening a dialog or moving focus; expands in place and dismisses only this item', async () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const second = { ...item, id: 'b1111111-1111-4111-8111-111111111111' }
    service.snapshot.set(snapshot([item, second]))
    const fixture = await show()
    expect(dialog.open).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
    const notice: HTMLElement = fixture.nativeElement.querySelector('xp-announcement-notice')
    expect(notice).not.toBeNull()
    const expand = notice.querySelector<HTMLButtonElement>('[aria-expanded]')!
    expand.click()
    fixture.detectChanges()
    expect(expand.getAttribute('aria-expanded')).toBe('true')
    expect(notice.querySelector('xp-notification-text')).not.toBeNull()
    expand.focus()
    expand.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(service.dismiss).toHaveBeenCalledTimes(1)
    expect(service.dismiss).toHaveBeenCalledWith(item.id)
    expect(document.activeElement).toBe(input)
    jest.advanceTimersByTime(2000)
    await Promise.resolve()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('xp-announcement-notice')).toBeNull()
    input.remove()
  })
  it('removes a notice on revocation or identity change without recording dismissal', async () => {
    const fixture = await show()
    service.snapshot.set(snapshot([]))
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('xp-announcement-notice')).toBeNull()
    service.identity.set('user-b')
    service.snapshot.set(null)
    fixture.detectChanges()
    expect(service.dismiss).not.toHaveBeenCalled()
  })
  it('does not show a late detail response after the pending announcement was removed', async () => {
    let resolve: (value: Announcement) => void = () => {}
    service.announcement.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const fixture = await show()
    service.snapshot.set(snapshot([]))
    fixture.detectChanges()
    resolve(item)
    await Promise.resolve()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('xp-announcement-notice')).toBeNull()
    expect(dialog.open).not.toHaveBeenCalled()
  })
})
