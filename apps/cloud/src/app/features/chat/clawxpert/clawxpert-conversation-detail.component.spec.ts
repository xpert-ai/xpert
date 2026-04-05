import { Component, Input, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { AiThreadService, ChatConversationService, IChatConversation } from '../../../@core'
import { ChatSharedTerminalComponent } from '../../../@shared/chat'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import { ClawXpertFacade } from './clawxpert.facade'

jest.mock('../../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    injectHostedAssistantChatkitControl: jest.fn(() => signal(null))
  }
})

@Component({
  standalone: true,
  selector: 'pac-clawxpert-conversation-files',
  template: ''
})
class MockClawXpertConversationFilesComponent {
  @Input() conversationId?: string | null
  @Input() mode?: 'readonly' | 'editable'
}

@Component({
  standalone: true,
  selector: 'chat-shared-terminal',
  template: ''
})
class MockChatSharedTerminalComponent {
  @Input() mode?: 'interactive' | 'replay'
  @Input() conversationId?: string | null
  @Input() projectId?: string | null
}

describe('ClawXpertConversationDetailComponent', () => {
  let facade: {
    definition: { titleKey: string; defaultTitle: string }
    loading: ReturnType<typeof signal<boolean>>
    viewState: ReturnType<typeof signal<'ready' | 'wizard' | 'error' | 'organization-required'>>
    resolvedPreference: ReturnType<typeof signal<{ assistantId: string } | null>>
    chatkitFrameUrl: ReturnType<typeof signal<string | null>>
    threadId: ReturnType<typeof signal<string | null>>
    pendingConversationStartId: ReturnType<typeof signal<number>>
    onChatThreadChange: jest.Mock
    beginPendingConversation: jest.Mock
    navigateToOverview: jest.Mock
  }
  let aiThreadService: {
    getThread: jest.Mock
  }
  let conversationService: {
    getByThreadId: jest.Mock
    getById: jest.Mock
  }

  beforeEach(async () => {
    facade = {
      definition: {
        titleKey: 'PAC.Chat.ClawXpert.DetailTitle',
        defaultTitle: 'ClawXpert'
      },
      loading: signal(false),
      viewState: signal('ready'),
      resolvedPreference: signal({ assistantId: 'assistant-1' }),
      chatkitFrameUrl: signal('https://frame.example.com'),
      threadId: signal('thread-1'),
      pendingConversationStartId: signal(0),
      onChatThreadChange: jest.fn(),
      beginPendingConversation: jest.fn(),
      navigateToOverview: jest.fn()
    }
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
      getByThreadId: jest.fn(() =>
        of({
          id: 'conversation-1',
          threadId: 'thread-1',
          projectId: 'project-1'
        } as IChatConversation)
      ),
      getById: jest.fn(() =>
        of({
          id: 'conversation-1',
          projectId: 'project-1'
        } as IChatConversation)
      )
    }

    TestBed.resetTestingModule()
    TestBed.overrideComponent(ClawXpertConversationDetailComponent, {
      remove: {
        imports: [ClawXpertConversationFilesComponent, ChatSharedTerminalComponent]
      },
      add: {
        imports: [MockClawXpertConversationFilesComponent, MockChatSharedTerminalComponent]
      }
    })
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertConversationDetailComponent],
      providers: [
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: AiThreadService,
          useValue: aiThreadService
        },
        {
          provide: ChatConversationService,
          useValue: conversationService
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('toggles the files panel and resolves the current conversation context from the thread', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    fixture.detectChanges()

    const filesPanel = fixture.debugElement.query(By.directive(MockClawXpertConversationFilesComponent))
    expect(aiThreadService.getThread).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).toHaveBeenCalledWith('conversation-1')
    expect(filesPanel).not.toBeNull()
    expect((filesPanel.componentInstance as MockClawXpertConversationFilesComponent).conversationId).toBe('conversation-1')

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    fixture.detectChanges()

    expect(fixture.debugElement.query(By.directive(MockClawXpertConversationFilesComponent))).toBeNull()
  })

  it('renders the terminal panel with the resolved conversation and project context', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('[data-panel-button="terminal"]').click()
    fixture.detectChanges()

    const terminal = fixture.debugElement.query(By.directive(MockChatSharedTerminalComponent))
    expect(terminal).not.toBeNull()
    expect((terminal.componentInstance as MockChatSharedTerminalComponent).mode).toBe('interactive')
    expect((terminal.componentInstance as MockChatSharedTerminalComponent).conversationId).toBe('conversation-1')
    expect((terminal.componentInstance as MockChatSharedTerminalComponent).projectId).toBe('project-1')
  })

  it('transitions the layout into a main workspace with a right-side chat dialog when a panel opens', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('xl:grid-cols-[0rem_minmax(0,1fr)]')
    expect(fixture.componentInstance.chatShellClasses()).toContain('rounded-none')
    expect(fixture.componentInstance.detailPanelShellClasses()).toContain('opacity-0')

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    fixture.detectChanges()

    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]')
    expect(fixture.componentInstance.chatShellClasses()).toContain('rounded-[2rem]')
    expect(fixture.componentInstance.chatShellClasses()).toContain('xl:max-w-[32rem]')
    expect(fixture.componentInstance.detailPanelShellClasses()).toContain('opacity-100')
  })

  it('shows the empty detail-panel state when no thread conversation can be resolved', async () => {
    aiThreadService.getThread.mockReturnValue(
      of({
        thread_id: 'thread-1',
        metadata: {}
      })
    )
    conversationService.getByThreadId.mockReturnValue(of(null))

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.DetailPanelEmptyTitle')
    expect(fixture.debugElement.query(By.directive(MockClawXpertConversationFilesComponent))).toBeNull()
  })

  it('falls back to resolving the conversation by thread id when thread metadata does not include conversation id', async () => {
    aiThreadService.getThread.mockReturnValue(
      of({
        thread_id: 'thread-1',
        metadata: {}
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('[data-panel-button="terminal"]').click()
    fixture.detectChanges()

    const terminal = fixture.debugElement.query(By.directive(MockChatSharedTerminalComponent))
    expect(conversationService.getByThreadId).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).not.toHaveBeenCalled()
    expect(terminal).not.toBeNull()
    expect((terminal.componentInstance as MockChatSharedTerminalComponent).conversationId).toBe('conversation-1')
    expect((terminal.componentInstance as MockChatSharedTerminalComponent).projectId).toBe('project-1')
  })

  it('keeps the panel available when metadata has conversation id but conversation detail lookup fails', async () => {
    conversationService.getById.mockReturnValue(of(null))

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    fixture.detectChanges()

    const filesPanel = fixture.debugElement.query(By.directive(MockClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()
    expect((filesPanel.componentInstance as MockClawXpertConversationFilesComponent).conversationId).toBe('conversation-1')
  })
})
