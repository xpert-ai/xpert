import { OverlayContainer } from '@angular/cdk/overlay'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of, Subject } from 'rxjs'
import { AssistantBindingService, ChatConversationService, IChatConversation } from '../../@core'
import { CloudSidebarRecentTasksComponent } from './cloud-sidebar-recent-tasks.component'

describe('Collapsed recent tasks', () => {
  const conversation = {
    id: 'conversation-1',
    threadId: 'thread-1',
    title: 'Recent task',
    xpertId: 'claw-xpert',
    updatedAt: new Date(),
    sidebar: { pinned: false, archived: false }
  } as IChatConversation
  let fixture: ComponentFixture<CloudSidebarRecentTasksComponent>
  let overlay: HTMLElement
  let api: { getSidebarConversations: jest.Mock; updateSidebarState: jest.Mock; unreadRefresh$: Subject<void> }

  beforeEach(async () => {
    api = {
      getSidebarConversations: jest.fn(() => of({ items: [conversation], total: 1 })),
      updateSidebarState: jest.fn(() => of({ pinned: true, archived: false })),
      unreadRefresh$: new Subject<void>()
    }
    await TestBed.configureTestingModule({
      imports: [CloudSidebarRecentTasksComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ChatConversationService, useValue: api },
        {
          provide: AssistantBindingService,
          useValue: { changes$: new Subject(), get: () => of({ assistantId: 'claw-xpert' }) }
        }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(CloudSidebarRecentTasksComponent)
    fixture.componentRef.setInput('collapsed', true)
    fixture.detectChanges()
    overlay = TestBed.inject(OverlayContainer).getContainerElement()
  })

  afterEach(() => fixture.destroy())

  async function open() {
    fixture.nativeElement.querySelector('button').click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  it('keeps a history icon and opens the recent conversation list on click', async () => {
    expect(fixture.nativeElement.querySelector('.ri-history-line')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-label')).toBe('XP.Sidebar.RecentTasks')
    expect(fixture.nativeElement.querySelector('xp-sidebar-conversation')).toBeNull()

    await open()

    expect(overlay.querySelector('[role="dialog"]')?.textContent).toContain('Recent task')
    expect(overlay.querySelector('a')?.getAttribute('href')).toBe('/chat/clawxpert/c/thread-1')
    expect(fixture.componentInstance.expanded()).toBe(false)
  })

  it('navigates to the selected conversation and closes the popup', async () => {
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true)
    await open()

    overlay.querySelector('a')?.click()
    fixture.detectChanges()

    expect(navigate).toHaveBeenCalledTimes(1)
    const target = navigate.mock.calls[0][0]
    expect(typeof target === 'string' ? target : TestBed.inject(Router).serializeUrl(target)).toBe(
      '/chat/clawxpert/c/thread-1'
    )
    expect(overlay.querySelector('[role="dialog"]')).toBeNull()
  })

  it('keeps conversation actions usable inside the popup', async () => {
    await open()

    overlay.querySelector<HTMLButtonElement>('[aria-label="XP.Sidebar.PinConversation"]')?.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(api.updateSidebarState).toHaveBeenCalledWith(conversation, { pinned: true })
    expect(fixture.componentInstance.menuOpen()).toBe(true)

    overlay.querySelector<HTMLButtonElement>('[aria-label="XP.Sidebar.ConversationMore"]')?.click()
    fixture.detectChanges()

    expect(overlay.querySelector('[role="menu"]')?.textContent).toContain('XP.Sidebar.DeleteConversation')
  })

  it('closes on Escape and sidebar expansion without losing the inline expansion state', async () => {
    fixture.componentInstance.expanded.set(true)
    await open()
    overlay.querySelector('a')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(overlay.querySelector('[role="dialog"]')).toBeNull()

    await open()
    fixture.componentRef.setInput('collapsed', false)
    fixture.detectChanges()
    expect(overlay.querySelector('[role="dialog"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('xp-sidebar-conversation')).not.toBeNull()

    fixture.componentRef.setInput('collapsed', true)
    fixture.detectChanges()
    expect(fixture.componentInstance.menuOpen()).toBe(false)
  })

  it('shows an empty state when no recent conversations exist', async () => {
    api.getSidebarConversations.mockReturnValue(of({ items: [], total: 0 }))
    api.unreadRefresh$.next()
    await open()

    expect(overlay.textContent).toContain('XP.Sidebar.NoRecentTasks')
    expect(overlay.querySelector('a')).toBeNull()
  })
})
