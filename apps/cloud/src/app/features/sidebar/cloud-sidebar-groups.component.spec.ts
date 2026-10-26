import { signal } from '@angular/core'
import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { ChatGroupSummary } from '@xpert-ai/contracts'
import { BehaviorSubject, Subject, of } from 'rxjs'
import { ScopeService, Store } from '../../@core'
import { ChatGroupService } from '../../@core/services/chat-group.service'
import { CloudSidebarGroupsComponent } from './cloud-sidebar-groups.component'

jest.mock('../../@core', () => ({
  ScopeService: class {},
  Store: class {},
  RequestScopeLevel: { ORGANIZATION: 'organization', TENANT: 'tenant' }
}))
jest.mock('../chat/groups/group-create-dialog.component', () => ({ GroupCreateDialogComponent: class {} }))

function group(id: string, overrides: Partial<ChatGroupSummary> = {}): ChatGroupSummary {
  return {
    id,
    purpose: 'group',
    threadId: `thread-${id}`,
    title: id,
    updatedAt: '',
    lastMessage: '',
    memberCount: 1,
    members: [{ id: 'member', kind: 'user', name: 'Member' }],
    unread: false,
    pinned: false,
    archived: false,
    ...overrides
  }
}

describe('inline sidebar group conversations', () => {
  const organization = new BehaviorSubject<string | null>('org-a')
  const user = new BehaviorSubject<{ id: string } | null>({ id: 'user-a' })
  const scope = signal({ level: 'organization' })
  const api = { list: jest.fn(), conversationRoute: jest.fn(), preferences: jest.fn() }
  const router = { events: new Subject(), url: '/chat', navigate: jest.fn() }
  const dialog = { open: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    organization.next('org-a')
    user.next({ id: 'user-a' })
    scope.set({ level: 'organization' })
    api.list.mockReturnValue(
      of([group('Team'), group('Pinned', { pinned: true }), group('Archive', { archived: true })])
    )
    api.conversationRoute.mockReturnValue(of(['/chat/x', 'primary', 'c', 'shared-thread']))
    api.preferences.mockReturnValue(of({}))
    router.navigate.mockResolvedValue(true)
    TestBed.configureTestingModule({
      imports: [CloudSidebarGroupsComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: { user$: user, selectOrganizationId: () => organization } },
        { provide: ScopeService, useValue: { activeScope: scope } },
        { provide: ChatGroupService, useValue: api },
        { provide: Router, useValue: router },
        { provide: Dialog, useValue: dialog }
      ]
    })
  })

  async function render() {
    const fixture = TestBed.createComponent(CloudSidebarGroupsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  it('shows groups expanded, sorts pinned groups first and filters with the panel search', async () => {
    const fixture = await render()
    const rows: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('[data-group-option]')
    expect([...rows].map((row) => row.getAttribute('data-group-option'))).toEqual(['Pinned', 'Team'])
    fixture.componentRef.setInput('query', 'team')
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelectorAll('[data-group-option]')).toHaveLength(1)
    fixture.nativeElement.querySelector('[aria-controls="' + fixture.componentInstance.sectionId + '"]').click()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[data-group-option]')).toBeNull()
    expect(fixture.componentInstance.expanded()).toBe(false)
  })

  it('opens the shared group route once when repeatedly clicked', async () => {
    const pending = new Subject<string[]>()
    api.conversationRoute.mockReturnValue(pending)
    const fixture = await render()
    const first = fixture.componentInstance.selectGroup('Team')
    void fixture.componentInstance.selectGroup('Team')
    expect(api.conversationRoute).toHaveBeenCalledTimes(1)
    pending.next(['/chat/x', 'primary', 'c', 'shared-thread'])
    await first
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'primary', 'c', 'shared-thread'])
  })

  it('retains personal pin, archive and restore actions and archived discovery', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.preferences(component.groups()[0], { pinned: true })
    expect(api.preferences).toHaveBeenLastCalledWith('Team', { pinned: true })
    await component.preferences(component.groups()[0], { archived: true })
    expect(api.preferences).toHaveBeenLastCalledWith('Team', { archived: true })
    fixture.nativeElement.querySelector('[data-toggle-archived]').click()
    fixture.detectChanges()
    expect(component.visibleGroups().map((item) => item.id)).toEqual(['Archive'])
    await component.preferences(component.visibleGroups()[0], { archived: false })
    expect(api.preferences).toHaveBeenLastCalledWith('Archive', { archived: false })
  })

  it('discards late lists and pending navigation after the organization changes', async () => {
    const oldList = new Subject<ChatGroupSummary[]>()
    api.list.mockReturnValueOnce(oldList)
    const fixture = await render()
    organization.next('org-b')
    fixture.detectChanges()
    await fixture.whenStable()
    oldList.next([group('Old organization')])
    await fixture.whenStable()
    expect(fixture.componentInstance.groups().some((item) => item.id === 'Old organization')).toBe(false)
    const route = new Subject<string[]>()
    api.conversationRoute.mockReturnValue(route)
    const navigation = fixture.componentInstance.selectGroup('Team')
    user.next({ id: 'user-b' })
    fixture.detectChanges()
    route.next(['/chat/x', 'old', 'c', 'old-thread'])
    await navigation
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('does not load or expose group actions without an organization scope', async () => {
    scope.set({ level: 'tenant' })
    const fixture = await render()
    await fixture.componentInstance.createGroup()
    await fixture.componentInstance.selectGroup('Team')
    expect(api.list).not.toHaveBeenCalled()
    expect(api.conversationRoute).not.toHaveBeenCalled()
    expect(dialog.open).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('section')).toBeNull()
    scope.set({ level: 'organization' })
    organization.next(null)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(api.list).not.toHaveBeenCalled()
  })

  it('shows a retryable loading error, distinct from an empty list', async () => {
    const pending = new Subject<ChatGroupSummary[]>()
    api.list.mockReturnValueOnce(pending)
    const fixture = await render()
    pending.error(new Error('unavailable'))
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('XP.Groups.LoadFailed')
    await fixture.componentInstance.reload()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull()
    expect(fixture.nativeElement.querySelectorAll('[data-group-option]')).toHaveLength(2)
  })

  it('creates through the existing dialog and opens the returned shared conversation', async () => {
    const closed = new Subject<string | undefined>()
    dialog.open.mockReturnValue({ closed, close: jest.fn(() => closed.next(undefined)) })
    const fixture = await render()
    const creation = fixture.componentInstance.createGroup()
    await fixture.whenStable()
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ panelClass: 'xp-overlay-pane-dialog' })
    )
    closed.next('new-group')
    await creation
    expect(api.conversationRoute).toHaveBeenCalledWith('new-group')
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'primary', 'c', 'shared-thread'])
  })

  it('closes group creation and clears results when its organization is left', async () => {
    const closed = new Subject<string | undefined>()
    const close = jest.fn(() => closed.next(undefined))
    dialog.open.mockReturnValue({ closed, close })
    const fixture = await render()
    const creation = fixture.componentInstance.createGroup()
    await fixture.whenStable()
    scope.set({ level: 'tenant' })
    fixture.detectChanges()
    await creation
    expect(close).toHaveBeenCalled()
    expect(fixture.componentInstance.groups()).toEqual([])
    expect(router.navigate).not.toHaveBeenCalled()
  })
})
