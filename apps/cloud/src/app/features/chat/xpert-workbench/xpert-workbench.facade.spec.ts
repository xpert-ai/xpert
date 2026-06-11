jest.mock('../../../@core', () => ({
  AssistantBindingScope: {
    USER: 'user'
  },
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  AssistantBindingService: class AssistantBindingService {},
  ChatConversationService: class ChatConversationService {},
  Store: class Store {},
  OrderTypeEnum: {
    DESC: 'DESC'
  },
  getErrorMessage: (error: { message?: string } | null | undefined) => error?.message ?? ''
}))

jest.mock('../../assistant/assistant-chatkit.runtime', () => ({
  sanitizeAssistantFrameUrl: (url: string | null | undefined) => url ?? null
}))

import { NavigationEnd, Router } from '@angular/router'
import { TestBed } from '@angular/core/testing'
import { Subject, of } from 'rxjs'
import { TranslateService } from '@ngx-translate/core'
import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { AssistantBindingService, ChatConversationService, IChatConversation, Store } from '../../../@core'
import { XpertWorkbenchFacade } from './xpert-workbench.facade'

describe('XpertWorkbenchFacade', () => {
  let routerEvents: Subject<NavigationEnd>
  let router: {
    events: Subject<NavigationEnd>
    navigate: jest.Mock
    url: string
  }
  let store: {
    organizationId: string | null
    selectOrganizationId: jest.Mock
  }
  let assistantBindingService: {
    getAvailableXperts: jest.Mock
  }
  let conversationService: {
    findAllByXpert: jest.Mock
  }
  let translate: {
    instant: jest.Mock
  }

  beforeEach(() => {
    routerEvents = new Subject<NavigationEnd>()
    router = {
      events: routerEvents,
      navigate: jest.fn().mockResolvedValue(true),
      url: '/chat/x/sales/c'
    }
    store = {
      organizationId: 'org-1',
      selectOrganizationId: jest.fn(() => of('org-1'))
    }
    assistantBindingService = {
      getAvailableXperts: jest.fn(() =>
        of([
          {
            id: 'xpert-1',
            slug: 'sales',
            title: 'Sales Xpert',
            latest: true
          }
        ])
      )
    }
    conversationService = {
      findAllByXpert: jest.fn(() => of({ items: [] as IChatConversation[] }))
    }
    translate = {
      instant: jest.fn((_key: string, params?: { Default?: string }) => params?.Default ?? _key)
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        XpertWorkbenchFacade,
        {
          provide: Router,
          useValue: router
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: AssistantBindingService,
          useValue: assistantBindingService
        },
        {
          provide: ChatConversationService,
          useValue: conversationService
        },
        {
          provide: TranslateService,
          useValue: translate
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads the accessible xpert for the current slug', async () => {
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()

    expect(assistantBindingService.getAvailableXperts).toHaveBeenCalled()
    expect(facade.viewState()).toBe('ready')
    expect(facade.xpertId()).toBe('xpert-1')
    expect(facade.assistantId()).toBe('xpert-1')
    expect(facade.identity()).toBe('chat-xpert-workbench:xpert-1')
  })

  it('shows an error when the slug is not accessible', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(of([{ id: 'xpert-2', slug: 'ops', latest: true }]))

    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()

    expect(facade.viewState()).toBe('error')
    expect(facade.xpertId()).toBeNull()
    expect(facade.viewErrorMessage()).toContain('unavailable')
  })

  it('resumes the latest xpert thread when entering the route without a thread id', async () => {
    conversationService.findAllByXpert.mockReturnValue(
      of({
        items: [
          {
            id: 'conversation-1',
            threadId: 'thread-1'
          } as IChatConversation
        ]
      })
    )
    const facade = TestBed.inject(XpertWorkbenchFacade)
    const control = createMockChatKitControl()

    await settle()
    await facade.ensureConversationEntry(control)

    expect(conversationService.findAllByXpert).toHaveBeenCalledWith('xpert-1', {
      take: 1,
      order: {
        updatedAt: 'DESC'
      }
    })
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales', 'c', 'thread-1'])
    expect(control.focusComposer).not.toHaveBeenCalled()
  })

  it('focuses the composer when no latest xpert thread exists', async () => {
    const facade = TestBed.inject(XpertWorkbenchFacade)
    const control = createMockChatKitControl()

    await settle()
    await facade.ensureConversationEntry(control)

    expect(router.navigate).not.toHaveBeenCalled()
    expect(control.focusComposer).toHaveBeenCalled()
  })

  it('syncs ChatKit thread changes into the xpert workbench route', async () => {
    const facade = TestBed.inject(XpertWorkbenchFacade)

    await settle()
    facade.onChatThreadChange('thread-2')

    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales', 'c', 'thread-2'])

    setRoute('/chat/x/sales/c/thread-2')
    facade.onChatThreadChange(null)

    expect(facade.suppressAutoResume()).toBe(true)
    expect(router.navigate).toHaveBeenLastCalledWith(['/chat/x', 'sales', 'c'])
  })

  function setRoute(url: string) {
    router.url = url
    routerEvents.next(new NavigationEnd(Date.now(), url, url))
  }

  function createMockChatKitControl() {
    return {
      element: null,
      setOptions: jest.fn(),
      focusComposer: jest.fn().mockResolvedValue(undefined),
      setThreadId: jest.fn().mockResolvedValue(undefined),
      sendUserMessage: jest.fn().mockResolvedValue(undefined),
      setComposerValue: jest.fn().mockResolvedValue(undefined),
      fetchUpdates: jest.fn().mockResolvedValue(undefined),
      sendCustomAction: jest.fn().mockResolvedValue(undefined)
    } satisfies ChatKitControl
  }
})

function settle() {
  return new Promise((resolve) => setTimeout(resolve))
}
