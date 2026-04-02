import { TestBed } from '@angular/core/testing'
import { of, throwError } from 'rxjs'
import { AiThreadService, ChatConversationService } from '../../../@core'
import { ChatBiTraceFacade } from './chatbi-trace.facade'

describe('ChatBiTraceFacade', () => {
  let aiThreadService: {
    getThread: jest.Mock
  }
  let conversationService: {
    getById: jest.Mock
  }
  let facade: ChatBiTraceFacade

  const computerConversation = {
    id: 'conversation-1',
    messages: [
      {
        id: 'message-1',
        role: 'ai',
        content: [
          {
            type: 'component',
            id: 'program-1',
            data: {
              id: 'program-1',
              category: 'Computer',
              type: 'program',
              toolset: 'sandbox',
              tool: 'run',
              title: 'Run program',
              message: 'python app.py',
              status: 'running',
              created_date: '2026-04-02T00:00:00.000Z',
              end_date: null
            }
          }
        ]
      }
    ]
  }

  const createFacade = () => {
    aiThreadService = {
      getThread: jest.fn(() =>
        of({
          thread_id: 'thread-1',
          metadata: {
            id: 'conversation-1'
          }
        })
      )
    }
    conversationService = {
      getById: jest.fn(() => of(computerConversation))
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        ChatBiTraceFacade,
        {
          provide: AiThreadService,
          useValue: aiThreadService
        },
        {
          provide: ChatConversationService,
          useValue: conversationService
        }
      ]
    })

    facade = TestBed.inject(ChatBiTraceFacade)
  }

  beforeEach(() => {
    jest.useFakeTimers()
    createFacade()
  })

  afterEach(() => {
    jest.useRealTimers()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('hydrates computer trace from thread and conversation messages', async () => {
    facade.handleThreadChange('thread-1')
    await flushPromises()

    expect(aiThreadService.getThread).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).toHaveBeenCalledWith('conversation-1', {
      relations: ['messages']
    })
    expect(facade.steps()).toHaveLength(1)
    expect(facade.steps()[0].id).toBe('program-1')
    expect(facade.steps()[0].data.category).toBe('Computer')
  })

  it('keeps only merged computer steps when the same id appears multiple times', async () => {
    conversationService.getById.mockReturnValue(
      of({
        id: 'conversation-1',
        messages: [
          {
            id: 'message-1',
            role: 'ai',
            content: [
              {
                type: 'component',
                id: 'program-1',
                data: {
                  id: 'program-1',
                  category: 'Computer',
                  type: 'program',
                  toolset: 'sandbox',
                  tool: 'run',
                  title: 'Run program',
                  message: 'python app.py',
                  status: 'running',
                  created_date: '2026-04-02T00:00:00.000Z',
                  end_date: null
                }
              }
            ]
          },
          {
            id: 'message-2',
            role: 'ai',
            content: [
              {
                type: 'component',
                id: 'program-1',
                data: {
                  id: 'program-1',
                  category: 'Computer',
                  type: 'program',
                  status: 'success',
                  end_date: '2026-04-02T00:00:01.000Z'
                }
              }
            ]
          }
        ]
      })
    )

    facade.handleThreadChange('thread-1')
    await flushPromises()

    expect(facade.steps()).toHaveLength(1)
    expect(facade.steps()[0]).toMatchObject({
      id: 'program-1',
      data: {
        status: 'success',
        title: 'Run program'
      }
    })
  })

  it('folds hydrated dashboard items with the same top-to-bottom replacement logic as live events', async () => {
    conversationService.getById.mockReturnValue(
      of({
        id: 'conversation-1',
        messages: [
          {
            id: 'message-1',
            role: 'ai',
            content: [createDashboardComponent('dashboard-1', 'Sales Trend')]
          },
          {
            id: 'message-2',
            role: 'ai',
            content: [createDashboardComponent('dashboard-2', 'Profit Trend')]
          },
          {
            id: 'message-3',
            role: 'ai',
            content: [
              {
                type: 'component',
                id: 'program-1',
                data: {
                  id: 'program-1',
                  category: 'Computer',
                  type: 'program',
                  toolset: 'sandbox',
                  tool: 'run',
                  title: 'Run program',
                  message: 'python app.py',
                  status: 'success'
                }
              }
            ]
          },
          {
            id: 'message-4',
            role: 'ai',
            content: [createDashboardComponent('dashboard-3', 'Inventory Trend')]
          }
        ]
      })
    )

    facade.handleThreadChange('thread-1')
    await flushPromises()

    expect(facade.steps()).toHaveLength(3)
    expect(facade.steps().map((step) => step.id)).toEqual(['dashboard-2', 'program-1', 'dashboard-3'])
    expect(facade.steps()[0]).toMatchObject({
      data: {
        title: 'Profit Trend'
      }
    })
    expect(facade.steps()[2]).toMatchObject({
      data: {
        title: 'Inventory Trend'
      }
    })
  })

  it('appends later hydrated dashboard items after a pinned dashboard instead of replacing it', async () => {
    conversationService.getById.mockReturnValue(
      of({
        id: 'conversation-1',
        messages: [
          {
            id: 'message-1',
            role: 'ai',
            content: [createDashboardComponent('dashboard-1', 'Sales Trend')]
          },
          {
            id: 'message-2',
            role: 'ai',
            content: [createDashboardComponent('dashboard-2', 'Profit Trend')]
          }
        ]
      })
    )

    facade.handleThreadChange('thread-1')
    await flushPromises()

    facade.toggleDashboardPin('dashboard-2')

    conversationService.getById.mockReturnValue(
      of({
        id: 'conversation-1',
        messages: [
          {
            id: 'message-1',
            role: 'ai',
            content: [createDashboardComponent('dashboard-1', 'Sales Trend')]
          },
          {
            id: 'message-2',
            role: 'ai',
            content: [createDashboardComponent('dashboard-2', 'Profit Trend')]
          },
          {
            id: 'message-3',
            role: 'ai',
            content: [createDashboardComponent('dashboard-3', 'Inventory Trend')]
          }
        ]
      })
    )

    await facade.hydrateCurrentThread()

    expect(facade.steps()).toHaveLength(2)
    expect(facade.steps()[0]).toMatchObject({
      id: 'dashboard-2',
      pinned: true
    })
    expect(facade.steps()[1]).toMatchObject({
      id: 'dashboard-3',
      pinned: false
    })
  })

  it('appends dashboard log events immediately while the response is streaming', () => {
    facade.handleThreadChange('thread-1')
    facade.handleResponseStart()

    facade.handleLog({
      __xpaiChatKit: true,
      type: 'event',
      event: 'public_event',
      data: [
        'log',
        {
          id: 'dashboard-1',
          type: 'component',
          data: {
            id: 'dashboard-1',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Sales Trend'
          }
        }
      ]
    })

    expect(facade.steps()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dashboard-1',
          data: expect.objectContaining({
            category: 'Dashboard',
            type: 'AnalyticalCard'
          })
        })
      ])
    )
  })

  it('replaces the latest unpinned dashboard event with the next dashboard event', () => {
    facade.handleResponseStart()

    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-1',
          type: 'component',
          data: {
            id: 'dashboard-1',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Sales Trend'
          }
        }
      }
    })
    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-2',
          type: 'component',
          data: {
            id: 'dashboard-2',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Profit Trend'
          }
        }
      }
    })

    expect(facade.steps()).toHaveLength(1)
    expect(facade.steps()[0]).toMatchObject({
      id: 'dashboard-2',
      data: {
        title: 'Profit Trend'
      }
    })
  })

  it('does not replace an earlier dashboard once a computer step has been appended after it', () => {
    facade.handleResponseStart()

    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: createDashboardComponent('dashboard-1', 'Sales Trend')
      }
    })
    facade.handleLog({
      name: 'thread.item.tool',
      data: {
        item: {
          id: 'program-1',
          type: 'component',
          data: {
            id: 'program-1',
            category: 'Computer',
            type: 'program',
            title: 'Run program',
            status: 'success'
          }
        }
      }
    })
    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: createDashboardComponent('dashboard-2', 'Profit Trend')
      }
    })

    expect(facade.steps()).toHaveLength(3)
    expect(facade.steps().map((step) => step.id)).toEqual(['dashboard-1', 'program-1', 'dashboard-2'])
  })

  it('appends a new dashboard snapshot when the latest dashboard is pinned', () => {
    facade.handleResponseStart()

    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-1',
          type: 'component',
          data: {
            id: 'dashboard-1',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Sales Trend'
          }
        }
      }
    })
    facade.toggleDashboardPin('dashboard-1')

    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-2',
          type: 'component',
          data: {
            id: 'dashboard-2',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Profit Trend'
          }
        }
      }
    })

    expect(facade.steps()).toHaveLength(2)
    expect(facade.steps()[0]).toMatchObject({
      id: 'dashboard-1',
      pinned: true
    })
    expect(facade.steps()[1]).toMatchObject({
      id: 'dashboard-2',
      pinned: false
    })
  })

  it('creates a new dashboard snapshot even when the incoming event reuses the same component id', () => {
    facade.handleResponseStart()

    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-1',
          type: 'component',
          data: {
            id: 'dashboard-1',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Sales Trend'
          }
        }
      }
    })
    facade.toggleDashboardPin('dashboard-1')

    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-1',
          type: 'component',
          data: {
            id: 'dashboard-1',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Sales Trend V2'
          }
        }
      }
    })

    expect(facade.steps()).toHaveLength(2)
    expect(facade.steps()[0].id).toBe('dashboard-1')
    expect(facade.steps()[1].id).toContain('dashboard-1:snapshot:')
    expect(facade.steps()[1]).toMatchObject({
      data: {
        title: 'Sales Trend V2'
      }
    })
  })

  it('preserves live log items when a new thread id arrives after streaming has started', () => {
    facade.handleResponseStart()
    conversationService.getById.mockReturnValue(
      of({
        id: 'conversation-1',
        messages: []
      })
    )

    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-1',
          type: 'component',
          data: {
            id: 'dashboard-1',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Sales Trend'
          }
        }
      }
    })

    expect(facade.steps()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dashboard-1'
        })
      ])
    )

    aiThreadService.getThread.mockReturnValue(
      of({
        thread_id: 'thread-1',
        metadata: {
          id: 'conversation-1'
        }
      })
    )

    facade.handleThreadChange('thread-1')

    expect(facade.steps()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dashboard-1'
        })
      ])
    )
  })

  it('keeps live log items visible while polling hydrates an older conversation snapshot', async () => {
    facade.handleThreadChange('thread-1')
    await flushPromises()

    conversationService.getById.mockReturnValue(
      of({
        id: 'conversation-1',
        messages: []
      })
    )

    facade.handleResponseStart()
    facade.handleLog({
      name: 'thread.item.widget',
      data: {
        item: {
          id: 'dashboard-1',
          type: 'component',
          data: {
            id: 'dashboard-1',
            category: 'Dashboard',
            type: 'AnalyticalCard',
            title: 'Sales Trend'
          }
        }
      }
    })

    jest.advanceTimersByTime(800)
    await flushPromises()

    expect(facade.steps()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dashboard-1'
        })
      ])
    )
  })

  it('starts polling on response start and stops with a final refresh on response end', async () => {
    facade.handleThreadChange('thread-1')
    await flushPromises()

    aiThreadService.getThread.mockClear()
    conversationService.getById.mockClear()

    facade.handleResponseStart()
    expect(facade.conversationStatus()).toBe('busy')

    jest.advanceTimersByTime(800)
    await flushPromises()

    expect(aiThreadService.getThread).toHaveBeenCalledTimes(1)
    expect(conversationService.getById).toHaveBeenCalledTimes(1)

    aiThreadService.getThread.mockClear()
    conversationService.getById.mockClear()

    facade.handleResponseEnd()
    await flushPromises()

    expect(facade.conversationStatus()).toBe('idle')
    expect(aiThreadService.getThread).toHaveBeenCalledTimes(1)
    expect(conversationService.getById).toHaveBeenCalledTimes(1)

    aiThreadService.getThread.mockClear()
    jest.advanceTimersByTime(1600)
    await flushPromises()

    expect(aiThreadService.getThread).not.toHaveBeenCalled()
  })

  it('clears old data before hydrating a new thread', async () => {
    facade.handleThreadChange('thread-1')
    await flushPromises()

    expect(facade.steps()).toHaveLength(1)

    aiThreadService.getThread.mockReturnValue(
      of({
        thread_id: 'thread-2',
        metadata: {
          id: 'conversation-2'
        }
      })
    )
    conversationService.getById.mockReturnValue(
      of({
        id: 'conversation-2',
        messages: []
      })
    )

    facade.handleThreadChange('thread-2')

    expect(facade.steps()).toEqual([])
    await flushPromises()

    expect(facade.threadId()).toBe('thread-2')
    expect(facade.steps()).toEqual([])
  })

  it('reports an error state when the thread activity cannot be loaded', async () => {
    aiThreadService.getThread.mockReturnValue(throwError(() => new Error('boom')))

    facade.handleThreadChange('thread-1')
    await flushPromises()

    expect(facade.state()).toBe('error')
    expect(facade.error()).toContain('boom')
  })
})

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function createDashboardComponent(id: string, title: string) {
  return {
    type: 'component',
    id,
    data: {
      id,
      category: 'Dashboard',
      type: 'AnalyticalCard',
      title
    }
  }
}
