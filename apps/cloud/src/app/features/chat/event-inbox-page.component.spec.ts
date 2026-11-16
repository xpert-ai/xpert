import { Component, Input } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import { EVENT_INBOX_VIEW_KEY, USER_EVENT_INBOX_SLOT } from '@xpert-ai/contracts'
import { Store } from '../../@core'
import { ExtensionHostOutletComponent } from '../../@shared/view-extension'
import { EventInboxPageComponent } from './event-inbox-page.component'

jest.mock('../../@core', () => ({ Store: class Store {} }))
jest.mock('../../@shared/view-extension', () => {
  const { Component } = jest.requireActual('@angular/core')
  @Component({ standalone: true, selector: 'xp-extension-host-outlet', template: '' })
  class ExtensionHostOutletComponent {}
  return { ExtensionHostOutletComponent }
})

@Component({ standalone: true, selector: 'xp-extension-host-outlet', template: '' })
class Slot {
  @Input() mode = ''
  @Input() hostType = ''
  @Input() hostId = ''
  @Input() slot = ''
  @Input() viewKey = ''
  @Input() fillAvailableHeight = false
}

it('mounts the personal inbox and replaces the outlet when the active identity or organization changes', () => {
  const org = new BehaviorSubject<string | null>('org-a')
  const user$ = new BehaviorSubject({ id: 'user', tenantId: 'tenant' })
  TestBed.configureTestingModule({
    imports: [EventInboxPageComponent, TranslateModule.forRoot()],
    providers: [{ provide: Store, useValue: { user$, selectOrganizationId: () => org } }]
  }).overrideComponent(EventInboxPageComponent, {
    remove: { imports: [ExtensionHostOutletComponent] },
    add: { imports: [Slot] }
  })
  const fixture = TestBed.createComponent(EventInboxPageComponent)
  const outlet = () => {
    fixture.detectChanges()
    return fixture.debugElement.query(By.directive(Slot))?.componentInstance
  }
  const first = outlet()
  expect(first).toMatchObject({
    mode: 'single-view',
    hostType: 'user',
    hostId: 'me',
    slot: USER_EVENT_INBOX_SLOT,
    viewKey: EVENT_INBOX_VIEW_KEY
  })
  org.next('org-b')
  const second = outlet()
  expect(second).not.toBe(first)
  user$.next({ id: 'other-user', tenantId: 'tenant' })
  expect(outlet()).not.toBe(second)
  org.next(null)
  expect(outlet()).toBeUndefined()
  expect(fixture.nativeElement.querySelector('[role="status"]')).toBeTruthy()
})
