jest.mock('../../../@core', () => ({
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  AiThreadService: class AiThreadService {},
  ChatConversationService: class ChatConversationService {},
  getErrorMessage: (error: any) => error?.message ?? ''
}))

jest.mock('@xpert-ai/headless-ui', () => {
  const { Component, Directive, Input } = jest.requireActual('@angular/core')

  @Directive({
    standalone: true,
    selector: '[z-button]'
  })
  class ZardButtonComponent {
    @Input() zType?: string
    @Input() displayDensity?: string
    @Input() zSize?: string
  }

  @Component({
    standalone: true,
    selector: 'z-icon',
    template: ''
  })
  class ZardIconComponent {
    @Input() zType?: string
  }

  return {
    ZardButtonComponent,
    ZardIconComponent
  }
})

jest.mock('@xpert-ai/chatkit-angular', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xpert-chatkit',
    template: ''
  })
  class ChatKit {
    @Input() control?: unknown
  }

  return {
    ChatKit
  }
})

jest.mock('./clawxpert-conversation-files.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-clawxpert-conversation-files',
    template: ''
  })
  class ClawXpertConversationFilesComponent {
    @Input() conversationId?: string | null
    @Input() mode?: 'readonly' | 'editable'
    @Input() reloadKey?: number
  }

  return {
    ClawXpertConversationFilesComponent
  }
})

jest.mock('../../../@shared/chat/terminal/terminal.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xp-chat-shared-terminal',
    template: ''
  })
  class ChatSharedTerminalComponent {
    @Input() mode?: 'interactive' | 'replay'
    @Input() conversationId?: string | null
    @Input() projectId?: string | null
  }

  return {
    ChatSharedTerminalComponent
  }
})

jest.mock('./clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

import { Component, Input, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { AiThreadService, ChatConversationService, IChatConversation } from '../../../@core'
import { ChatSharedTerminalComponent } from '../../../@shared/chat/terminal/terminal.component'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import { ClawXpertFacade } from './clawxpert.facade'

jest.mock('../../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    injectHostedAssistantChatkitControl: jest.fn(() => signal(null))
  }
})

const runtimeModule = jest.requireMock('../../assistant/assistant-chatkit.runtime') as {
  injectHostedAssistantChatkitControl: jest.Mock
}

type MockChatKitEvent = {
  name: string
  data?: object
}

type MockChatKitRuntimeInput = {
  onEffect?: (event: MockChatKitEvent) => void
  onLog?: (event: MockChatKitEvent) => void
  onResponseStart?: () => void
  onResponseEnd?: () => void
}

async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  fixture.detectChanges()
  await fixture.whenStable()
  await Promise.resolve()
  await Promise.resolve()
  fixture.detectChanges()
}

function getRuntimeInput() {
  return runtimeModule.injectHostedAssistantChatkitControl.mock.calls.at(-1)?.[0] as MockChatKitRuntimeInput
}

describe('ClawXpertConversationDetailComponent', () => {
  let facade: {
    definition: { titleKey: string; defaultTitle: string }
    loading: ReturnType<typeof signal<boolean>>
    viewState: ReturnType<typeof signal<'ready' | 'wizard' | 'error' | 'organization-required'>>
    resolvedPreference: ReturnType<typeof signal<{ assistantId: string } | null>>
    chatkitFrameUrl: ReturnType<typeof signal<string | null>>
    threadId: ReturnType<typeof signal<string | null>>
    suppressAutoResume: ReturnType<typeof signal<boolean>>
    pendingConversationStartId: ReturnType<typeof signal<number>>
    onChatThreadChange: jest.Mock
    beginPendingConversation: jest.Mock
    ensureConversationEntry: jest.Mock
    navigateToOverview: jest.Mock
    setActiveConversation: jest.Mock
    patchActiveConversationStatus: jest.Mock
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
      suppressAutoResume: signal(false),
      pendingConversationStartId: signal(0),
      onChatThreadChange: jest.fn(),
      beginPendingConversation: jest.fn(),
      ensureConversationEntry: jest.fn(),
      navigateToOverview: jest.fn(),
      setActiveConversation: jest.fn(),
      patchActiveConversationStatus: jest.fn()
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
    jest.useRealTimers()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('toggles the files panel and resolves the current conversation context from the thread', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(aiThreadService.getThread).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).toHaveBeenCalledWith('conversation-1')
    expect(facade.setActiveConversation).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'conversation-1' }))
    expect(filesPanel).not.toBeNull()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).conversationId).toBe('conversation-1')

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    fixture.detectChanges()

    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).toBeNull()
  })

  it('renders the terminal panel with the resolved conversation and project context', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.nativeElement.querySelector('[data-panel-button="terminal"]').click()
    await settle(fixture)

    const terminal = fixture.debugElement.query(By.directive(ChatSharedTerminalComponent))
    expect(terminal).not.toBeNull()
    expect((terminal.componentInstance as ChatSharedTerminalComponent).mode).toBe('interactive')
    expect((terminal.componentInstance as ChatSharedTerminalComponent).conversationId).toBe('conversation-1')
    expect((terminal.componentInstance as ChatSharedTerminalComponent).projectId).toBe('project-1')
  })

  it('transitions the layout into a main workspace with a right-side chat dialog when a panel opens', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    await settle(fixture)

    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('xl:grid-cols-[0rem_minmax(0,1fr)]')
    expect(fixture.componentInstance.chatShellClasses()).toContain('rounded-none')
    expect(fixture.componentInstance.detailPanelShellClasses()).toContain('opacity-0')

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    await settle(fixture)

    const chatShell = fixture.nativeElement.querySelectorAll('section')[1]?.querySelector('div') as HTMLElement | null

    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]')
    expect(fixture.componentInstance.chatShellClasses()).toContain('xl:max-w-[32rem]')
    expect(fixture.componentInstance.detailPanelShellClasses()).toContain('opacity-100')
    expect(chatShell?.className).toContain('rounded-3xl')
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
    await settle(fixture)

    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.DetailPanelEmptyTitle')
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).toBeNull()
  })

  it('falls back to resolving the conversation by thread id when thread metadata does not include conversation id', async () => {
    aiThreadService.getThread.mockReturnValue(
      of({
        thread_id: 'thread-1',
        metadata: {}
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.nativeElement.querySelector('[data-panel-button="terminal"]').click()
    await settle(fixture)

    const terminal = fixture.debugElement.query(By.directive(ChatSharedTerminalComponent))
    expect(conversationService.getByThreadId).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).not.toHaveBeenCalled()
    expect(facade.setActiveConversation).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'conversation-1' }))
    expect(terminal).not.toBeNull()
    expect((terminal.componentInstance as ChatSharedTerminalComponent).conversationId).toBe('conversation-1')
    expect((terminal.componentInstance as ChatSharedTerminalComponent).projectId).toBe('project-1')
  })

  it('keeps the panel available when metadata has conversation id but conversation detail lookup fails', async () => {
    conversationService.getById.mockReturnValue(of(null))

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).conversationId).toBe('conversation-1')
  })

  it('clears the shared active conversation when the thread is reset or the component is destroyed', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    facade.setActiveConversation.mockClear()
    facade.threadId.set(null)
    await settle(fixture)

    expect(facade.setActiveConversation).toHaveBeenCalledWith(null)

    facade.setActiveConversation.mockClear()
    fixture.destroy()

    expect(facade.setActiveConversation).toHaveBeenCalledWith(null)
  })

  it('updates the shared sidebar status when a response starts and ends', async () => {
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined)
      })
    )
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()

    runtimeInput.onResponseStart?.()
    runtimeInput.onResponseEnd?.()

    expect(facade.patchActiveConversationStatus).toHaveBeenNthCalledWith(1, 'busy')
    expect(facade.patchActiveConversationStatus).toHaveBeenNthCalledWith(2, 'idle')
  })

  it('asks the facade to resolve the preferred conversation entry when the route has no thread id', async () => {
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        focusComposer: jest.fn()
      })
    )
    facade.threadId.set(null)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(facade.ensureConversationEntry).toHaveBeenCalled()
  })

  it('syncs the resumed thread into the chatkit control when the route thread changes', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    facade.threadId.set(null)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(setThreadId).toHaveBeenCalledWith(null)

    facade.threadId.set('thread-2')
    await settle(fixture)

    expect(setThreadId).toHaveBeenLastCalledWith('thread-2')
  })

  it('passes the file list reload key to the files panel and refreshes it after relevant log events', async () => {
    jest.useFakeTimers()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(0)

    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        payload: {
          item: {
            tool: 'sandbox_edit_file'
          }
        }
      }
    })
    fixture.detectChanges()

    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(0)

    jest.advanceTimersByTime(299)
    fixture.detectChanges()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(0)

    jest.advanceTimersByTime(1)
    fixture.detectChanges()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(1)
  })

  it('debounces multiple relevant log events into a single file list refresh', async () => {
    jest.useFakeTimers()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()

    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        detail: {
          tool: 'sandbox_write_file'
        }
      }
    })
    jest.advanceTimersByTime(200)

    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        detail: {
          tool: 'sandbox_shell'
        }
      }
    })
    fixture.detectChanges()

    jest.advanceTimersByTime(299)
    fixture.detectChanges()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(0)

    jest.advanceTimersByTime(1)
    fixture.detectChanges()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(1)
  })

  it('ignores unrelated log events, read-only file tools, and empty effect allowlists', async () => {
    jest.useFakeTimers()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()

    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        detail: {
          tool: 'sandbox_read_file'
        }
      }
    })
    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        detail: {
          tool: 'sandbox_glob'
        }
      }
    })
    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        detail: {
          tool: 'not_a_workspace_tool'
        }
      }
    })
    runtimeInput.onEffect?.({
      name: 'refresh_workspace_files',
      data: {
        scope: 'workspace'
      }
    })

    jest.advanceTimersByTime(300)
    fixture.detectChanges()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(0)
  })

  it('refreshes the file list for legacy Bash execute log events', async () => {
    jest.useFakeTimers()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()

    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        message: {
          toolset: 'Bash',
          tool: 'execute'
        }
      }
    })

    jest.advanceTimersByTime(300)
    fixture.detectChanges()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(1)
  })
})
