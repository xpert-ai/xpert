import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { of } from 'rxjs'
import { NGXLogger } from 'ngx-logger'
import { ChatConversationService, ChatMessageFeedbackService, ChatMessageService, ToastrService, XpertAPIService } from '../../../@core/services'
import { AppService } from '../../../app.service'
import { ChatService as ChatServerService } from '../../../@core/services/chat.service'
import { XpertHomeService } from '../../../xpert'
import { ChatHomeService } from '../home.service'
import { ChatCommonService } from './common-chat.service'

describe('ChatCommonService', () => {
  let service: ChatCommonService
  let router: {
    navigate: jest.Mock
    navigateByUrl: jest.Mock
    url: string
  }
  let chatServerService: {
    chat: jest.Mock
  }
  let xpertService: {
    getById: jest.Mock
  }
  let homeService: {
    canvasOpened: ReturnType<typeof signal>
    conversation: ReturnType<typeof signal>
    conversationId: ReturnType<typeof signal>
    conversationTitle: () => string | null
    conversations: ReturnType<typeof signal>
    currentPage: ReturnType<typeof signal>
    lang: ReturnType<typeof signal>
    pagesCompleted: ReturnType<typeof signal>
    xpert: ReturnType<typeof signal>
  }

  beforeEach(() => {
    const conversation = signal<{ title?: string | null } | null>(null)

    router = {
      navigate: jest.fn(),
      navigateByUrl: jest.fn(),
      url: '/chat/x/common'
    }
    chatServerService = {
      chat: jest.fn(() => of(null))
    }
    xpertService = {
      getById: jest.fn(() =>
        of({
          id: 'assistant-1',
          slug: 'assistant-1',
          name: 'Assistant One',
          knowledgebases: [],
          toolsets: []
        })
      )
    }
    homeService = {
      canvasOpened: signal(null),
      conversation,
      conversationId: signal<string | null>(null),
      conversationTitle: () => conversation()?.title ?? null,
      conversations: signal({}),
      currentPage: signal(0),
      lang: signal('en'),
      pagesCompleted: signal(false),
      xpert: signal(null)
    }

    TestBed.configureTestingModule({
      providers: [
        ChatCommonService,
        {
          provide: ChatHomeService,
          useValue: homeService
        },
        {
          provide: XpertHomeService,
          useExisting: ChatHomeService
        },
        {
          provide: Router,
          useValue: router
        },
        {
          provide: ChatServerService,
          useValue: chatServerService
        },
        {
          provide: ChatConversationService,
          useValue: {
            getById: jest.fn(() => of(null))
          }
        },
        {
          provide: ChatMessageFeedbackService,
          useValue: {
            getMyAll: jest.fn(() => of({ items: [] }))
          }
        },
        {
          provide: ChatMessageService,
          useValue: {
            suggestedQuestions: jest.fn(() => of([]))
          }
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: AppService,
          useValue: {
            lang: signal('en')
          }
        },
        {
          provide: NGXLogger,
          useValue: {
            error: jest.fn(),
            debug: jest.fn(),
            trace: jest.fn()
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn()
          }
        }
      ]
    })

    service = TestBed.inject(ChatCommonService)
  })

  it('keeps the common route when starting a new conversation without a target xpert', () => {
    service.newConv()

    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.navigateByUrl).not.toHaveBeenCalled()
    expect(homeService.conversationId()).toBeNull()
  })

  it('does not rewrite the route when a conversation id is assigned', async () => {
    service.conversation.set({
      id: 'conv-1'
    })
    await Promise.resolve()

    expect(homeService.conversationId()).toBe('conv-1')
    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.navigateByUrl).not.toHaveBeenCalled()
  })

  it('navigates to a specific xpert route when a target xpert is provided', () => {
    service.newConv({
      id: 'xpert-1',
      slug: 'sales'
    })

    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'sales'])
  })

  it('routes chat requests through the bound assistant id', async () => {
    await service.setAssistantId('assistant-1')
    await Promise.resolve()

    service.chatRequest(
      '',
      {
        action: 'send',
        message: {
          input: {
            input: 'hello'
          }
        }
      },
      {
        messageId: 'message-1'
      }
    ).subscribe()

    expect(xpertService.getById).toHaveBeenCalledWith('assistant-1', {
      relations: ['agent', 'copilotModel', 'knowledgebases', 'toolsets']
    })
    expect(homeService.xpert()?.id).toBe('assistant-1')
    expect(chatServerService.chat).toHaveBeenCalledWith(
      {
        action: 'send',
        message: {
          input: {
            input: 'hello'
          }
        }
      },
      {
        messageId: 'message-1',
        xpertId: 'assistant-1'
      }
    )
  })
})
