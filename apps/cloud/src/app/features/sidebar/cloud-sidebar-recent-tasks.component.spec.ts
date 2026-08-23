import { TestBed } from '@angular/core/testing'
import { NavigationEnd, Router } from '@angular/router'
import { of, Subject } from 'rxjs'
import { AssistantBindingService, ChatConversationService, IChatConversation, OrderTypeEnum } from '../../@core'
import { CloudSidebarRecentTasksComponent } from './cloud-sidebar-recent-tasks.component'

describe('CloudSidebarRecentTasksComponent', () => {
  const routerEvents = new Subject<NavigationEnd>()
  const conversationRefresh = new Subject<void>()
  const conversation = {
    id: 'conversation-1',
    threadId: 'thread-1',
    title: 'Recent Claw task',
    xpertId: 'claw-xpert',
    updatedAt: new Date()
  } as IChatConversation
  const assistantBindingService = {
    changes$: new Subject(),
    get: jest.fn(() => of({ assistantId: 'claw-xpert' }))
  }
  const conversationService = {
    unreadRefresh$: conversationRefresh.asObservable(),
    getMyInOrg: jest.fn(() => of({ items: [conversation], total: 1 }))
  }

  beforeEach(() => {
    assistantBindingService.get.mockClear()
    conversationService.getMyInOrg.mockClear()

    TestBed.configureTestingModule({
      imports: [CloudSidebarRecentTasksComponent],
      providers: [
        { provide: Router, useValue: { events: routerEvents.asObservable() } },
        { provide: AssistantBindingService, useValue: assistantBindingService },
        { provide: ChatConversationService, useValue: conversationService }
      ]
    }).overrideComponent(CloudSidebarRecentTasksComponent, {
      set: {
        imports: [],
        template: ''
      }
    })
  })

  it('loads the ten latest current-user Claw conversations and refreshes after conversation or route changes', () => {
    const fixture = TestBed.createComponent(CloudSidebarRecentTasksComponent)
    const component = fixture.componentInstance
    fixture.detectChanges()

    expect(conversationService.getMyInOrg).toHaveBeenLastCalledWith({
      select: ['id', 'threadId', 'title', 'updatedAt', 'xpertId'],
      order: { updatedAt: OrderTypeEnum.DESC },
      take: 10,
      where: { xpertId: 'claw-xpert' }
    })
    expect(component.conversations()).toEqual([conversation])

    conversationRefresh.next()
    routerEvents.next(new NavigationEnd(1, '/chat/clawxpert/c', '/chat/clawxpert/c/thread-1'))

    expect(conversationService.getMyInOrg).toHaveBeenCalledTimes(3)
    expect(component.taskRoute(conversation)).toEqual(['/chat/clawxpert', 'c', 'thread-1'])
  })

  it('keeps the recent task list collapsed until requested', () => {
    const fixture = TestBed.createComponent(CloudSidebarRecentTasksComponent)
    const component = fixture.componentInstance

    expect(component.expanded()).toBe(false)

    component.toggleExpanded()

    expect(component.expanded()).toBe(true)
  })

  it('sorts recent tasks from newest to oldest and keeps at most ten', () => {
    const conversations = Array.from({ length: 12 }, (_, index) => ({
      id: `conversation-${index}`,
      threadId: `thread-${index}`,
      title: `Task ${index}`,
      xpertId: 'claw-xpert',
      updatedAt: new Date(Date.UTC(2026, 0, index + 1))
    })) as IChatConversation[]
    conversationService.getMyInOrg.mockReturnValue(of({ items: conversations, total: conversations.length }))

    const fixture = TestBed.createComponent(CloudSidebarRecentTasksComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.conversations().map((item) => item.title)).toEqual([
      'Task 11',
      'Task 10',
      'Task 9',
      'Task 8',
      'Task 7',
      'Task 6',
      'Task 5',
      'Task 4',
      'Task 3',
      'Task 2'
    ])
  })
})
