import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ChatConversationService, TChatConversationLog, XpertAPIService } from '@cloud/app/@core'
import { XpertComponent } from '../xpert.component'
import { XpertLogsComponent } from './logs.component'

jest.mock('echarts/core', () => ({
  registerTheme: jest.fn()
}))

jest.mock('@cloud/app/@shared/chat', () => {
  const angular = jest.requireActual<typeof import('@angular/core')>('@angular/core')

  class MockChatConversationPreviewComponent {
    readonly?: boolean
    conversationId?: string | null
    organizationId?: string | null
    runtimeCapabilitiesSource?: string
    readonly close = new angular.EventEmitter<void>()
    readonly execution = new angular.EventEmitter<string>()
    readonly xpert = angular.signal(null)
  }

  angular.Input()(MockChatConversationPreviewComponent.prototype, 'readonly')
  angular.Input()(MockChatConversationPreviewComponent.prototype, 'conversationId')
  angular.Input()(MockChatConversationPreviewComponent.prototype, 'organizationId')
  angular.Input()(MockChatConversationPreviewComponent.prototype, 'runtimeCapabilitiesSource')
  angular.Output()(MockChatConversationPreviewComponent.prototype, 'close')
  angular.Output()(MockChatConversationPreviewComponent.prototype, 'execution')

  class MockChatMessageExecutionPanelComponent {
    id?: string | null
    organizationId?: string | null
    xpert?: unknown
    readonly close = new angular.EventEmitter<void>()
  }

  angular.Input()(MockChatMessageExecutionPanelComponent.prototype, 'id')
  angular.Input()(MockChatMessageExecutionPanelComponent.prototype, 'organizationId')
  angular.Input()(MockChatMessageExecutionPanelComponent.prototype, 'xpert')
  angular.Output()(MockChatMessageExecutionPanelComponent.prototype, 'close')

  return {
    ChatConversationPreviewComponent: angular.Component({
      standalone: true,
      selector: 'xp-chat-conversation-preview',
      template: ''
    })(MockChatConversationPreviewComponent),
    ChatMessageExecutionPanelComponent: angular.Component({
      standalone: true,
      selector: 'chat-message-execution-panel',
      template: ''
    })(MockChatMessageExecutionPanelComponent)
  }
})

function createConversation(overrides: Partial<TChatConversationLog> = {}): TChatConversationLog {
  return {
    id: 'conversation-1',
    threadId: 'thread-1',
    title: 'Procurement analysis',
    status: 'busy',
    from: 'api',
    organizationId: 'org-1',
    createdBy: {
      id: 'user-1',
      firstName: 'Admin',
      lastName: 'Super'
    },
    fromEndUserId: 'end-user-1',
    messageCount: 8,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    ...overrides
  }
}

async function setup(options?: { conversations?: TChatConversationLog[] }) {
  const latestXpert = signal({ id: 'xpert-1' })
  const conversations = options?.conversations ?? [createConversation()]
  const xpertService = {
    getConversations: jest.fn(() => of({ items: conversations, total: conversations.length }))
  }
  const conversationService = {
    cancelConversation: jest.fn(() => of({ canceledExecutionIds: ['execution-1'] }))
  }

  TestBed.resetTestingModule()
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), XpertLogsComponent],
    providers: [
      {
        provide: XpertComponent,
        useValue: {
          latestXpert
        }
      },
      {
        provide: XpertAPIService,
        useValue: xpertService
      },
      {
        provide: ChatConversationService,
        useValue: conversationService
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(XpertLogsComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return {
    component: fixture.componentInstance,
    conversationService,
    fixture,
    latestXpert,
    xpertService
  }
}

describe('XpertLogsComponent', () => {
  let fixture: ComponentFixture<XpertLogsComponent> | null = null

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    fixture?.destroy()
    fixture = null
    localStorage.clear()
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
  })

  it('requests logs with server-side search, status filters, and source filters', async () => {
    const context = await setup()
    fixture = context.fixture

    context.xpertService.getConversations.mockClear()
    context.component.searchText.set('admin')
    context.component.setStatuses(['busy', 'error'])
    context.component.setSources(['api'])

    await context.component.reloadConversations()

    expect(context.xpertService.getConversations).toHaveBeenCalledWith(
      'xpert-1',
      expect.objectContaining({
        relations: ['createdBy'],
        where: {
          status: { $in: ['busy', 'error'] },
          from: { $in: ['api'] }
        },
        take: 20,
        skip: 0
      }),
      expect.any(Array),
      'admin'
    )
  })

  it('restores visible columns and column widths from local storage', async () => {
    localStorage.setItem(
      'xpert.logs.table.columns.v1:xpert-1',
      JSON.stringify({
        order: ['threadId', 'createdBy'],
        columns: [
          { key: 'threadId', visible: true, width: 333 },
          { key: 'title', visible: true, width: 444 }
        ]
      })
    )

    const context = await setup()
    fixture = context.fixture

    const titleColumn = context.component.logColumns.find((column) => column.key === 'title')
    const threadColumn = context.component.logColumns.find((column) => column.key === 'threadId')

    expect(titleColumn).toBeDefined()
    expect(threadColumn).toBeDefined()

    if (!titleColumn || !threadColumn) {
      return
    }

    expect(context.component.columnWidth(titleColumn)).toBe(444)
    expect(context.component.isColumnVisible(threadColumn)).toBe(true)
    expect(
      context.component
        .visibleColumns()
        .map((column) => column.key)
        .slice(0, 3)
    ).toEqual(['title', 'threadId', 'createdBy'])
  })

  it('persists manual column resizing', async () => {
    const context = await setup()
    fixture = context.fixture
    const titleColumn = context.component.logColumns.find((column) => column.key === 'title')

    expect(titleColumn).toBeDefined()

    if (!titleColumn) {
      return
    }

    context.component.startColumnResize(new MouseEvent('mousedown', { button: 0, clientX: 360 }), titleColumn)
    context.component.onDocumentMouseMove(new MouseEvent('mousemove', { clientX: 420 }))
    context.component.stopColumnResize()

    expect(context.component.columnWidth(titleColumn)).toBe(420)
    expect(localStorage.getItem('xpert.logs.table.columns.v1:xpert-1')).toContain('"width":420')
  })

  it('persists custom column ordering while keeping fixed columns at the edges', async () => {
    const context = await setup()
    fixture = context.fixture

    context.component.moveColumnOrder('createdBy', 'status', 'after')

    const visibleKeys = context.component.visibleColumns().map((column) => column.key)
    expect(visibleKeys[0]).toBe('title')
    expect(visibleKeys[visibleKeys.length - 1]).toBe('actions')
    expect(visibleKeys.indexOf('status')).toBeLessThan(visibleKeys.indexOf('createdBy'))

    const raw = localStorage.getItem('xpert.logs.table.columns.v1:xpert-1') ?? '{}'
    expect(JSON.parse(raw)).toEqual(
      expect.objectContaining({
        order: expect.arrayContaining(['title', 'status', 'createdBy', 'actions'])
      })
    )
  })

  it('marks a busy conversation as interrupted after canceling it', async () => {
    const conversation = createConversation({ status: 'busy' })
    const context = await setup({ conversations: [conversation] })
    fixture = context.fixture

    context.component.cancelConversation(new MouseEvent('click'), conversation)

    expect(context.conversationService.cancelConversation).toHaveBeenCalledWith('conversation-1', 'org-1')
    expect(context.component.conversations()[0].status).toBe('interrupted')
  })
})
