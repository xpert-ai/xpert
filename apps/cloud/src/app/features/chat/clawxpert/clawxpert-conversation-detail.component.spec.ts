jest.mock('../../../@core', () => ({
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  AiThreadService: class AiThreadService {},
  ChatConversationService: class ChatConversationService {},
  getErrorMessage: (error: any) => error?.message ?? '',
  injectToastr: () => ({
    warning: jest.fn(),
    danger: jest.fn()
  })
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

  @Directive({
    standalone: true,
    selector: '[z-tab-nav-bar]'
  })
  class ZardTabNavBarDirective {
    @Input() tabPanel?: unknown
    @Input() color?: string
    @Input() alignTabs?: string
    @Input() stretchTabs?: string | boolean
    @Input() disableRipple?: boolean
    @Input() zSize?: string
  }

  @Directive({
    standalone: true,
    selector: '[z-tab-link]'
  })
  class ZardTabLinkDirective {
    @Input() active?: boolean
  }

  @Component({
    standalone: true,
    selector: 'z-tab-nav-panel',
    template: '<ng-content />'
  })
  class ZardTabNavPanelComponent {}

  @Directive({
    standalone: true,
    selector: '[z-menu]'
  })
  class ZardMenuDirective {
    @Input() zMenuTriggerFor?: unknown
  }

  @Directive({
    standalone: true,
    selector: '[z-menu-content]'
  })
  class ZardMenuContentDirective {}

  @Directive({
    standalone: true,
    selector: '[z-menu-item]'
  })
  class ZardMenuItemDirective {}

  return {
    ZardButtonComponent,
    ZardIconComponent,
    ZardMenuImports: [ZardMenuDirective, ZardMenuContentDirective, ZardMenuItemDirective],
    ZardTabsImports: [ZardTabNavBarDirective, ZardTabLinkDirective, ZardTabNavPanelComponent]
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
  const { Component, EventEmitter, Input, Output } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-clawxpert-conversation-files',
    template: ''
  })
  class ClawXpertConversationFilesComponent {
    @Input() conversationId?: string | null
    @Input() xpertId?: string | null
    @Input() mode?: 'readonly' | 'editable'
    @Input() reloadKey?: number
    @Output() referenceRequest = new EventEmitter()
  }

  return {
    ClawXpertConversationFilesComponent
  }
})

jest.mock('./clawxpert-conversation-preview.component', () => {
  const { Component, EventEmitter, Input, Output } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-clawxpert-conversation-preview',
    template: ''
  })
  class ClawXpertConversationPreviewComponent {
    @Input() conversationId?: string | null
    @Input() serviceId?: string | null
    @Input() url?: string | null
    @Input() zoom?: number
    @Input() deviceToolbarVisible?: boolean
    @Input() reloadKey?: number
    @Output() browserStateChange = new EventEmitter()
    @Output() referenceRequest = new EventEmitter()
  }

  return {
    ClawXpertConversationPreviewComponent
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

jest.mock('../../../@shared/chat/computer-timeline/computer-timeline.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xp-chat-computer-timeline',
    template: ''
  })
  class ChatComputerTimelineComponent {
    @Input() conversation?: unknown
    @Input() projectId?: string | null
    @Input() title?: string | null
  }

  return {
    ChatComputerTimelineComponent
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
import { ChatComputerTimelineComponent } from '../../../@shared/chat/computer-timeline/computer-timeline.component'
import { ChatSharedTerminalComponent } from '../../../@shared/chat/terminal/terminal.component'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import { ClawXpertConversationPreviewComponent } from './clawxpert-conversation-preview.component'
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
  initialThread?: () => string | null
  onThreadChange?: (event: { threadId: string | null }) => void
  onThreadLoadStart?: (event: { threadId: string | null }) => void
  onThreadLoadEnd?: (event: { threadId: string | null }) => void
  onEffect?: (event: MockChatKitEvent) => void
  onLog?: (event: MockChatKitEvent) => void
  onResponseStart?: () => void
  onResponseEnd?: () => void
}

type WorkspaceTabKindForTest = 'files' | 'computer' | 'terminal' | 'browser'
type WorkspaceTabForTest = {
  id: string
  kind: WorkspaceTabKindForTest
}
type WorkspaceTabTestComponent = ClawXpertConversationDetailComponent & {
  addWorkspaceTab(kind: WorkspaceTabKindForTest): WorkspaceTabForTest
}

async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  fixture.detectChanges()
  await fixture.whenStable()
  await Promise.resolve()
  await Promise.resolve()
  fixture.detectChanges()
}

async function settleWithFakeTimers(fixture: { detectChanges: () => void }) {
  fixture.detectChanges()
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
    loadingUserPreference: ReturnType<typeof signal<boolean>>
    viewState: ReturnType<typeof signal<'ready' | 'wizard' | 'error' | 'organization-required'>>
    resolvedPreference: ReturnType<typeof signal<{ assistantId: string } | null>>
    xpertId: ReturnType<typeof signal<string | null>>
    chatkitFrameUrl: ReturnType<typeof signal<string | null>>
    threadId: ReturnType<typeof signal<string | null>>
    suppressAutoResume: ReturnType<typeof signal<boolean>>
    pendingConversationStartId: ReturnType<typeof signal<number>>
    activeConversation: ReturnType<typeof signal<IChatConversation | null>>
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
    const activeConversation = signal<IChatConversation | null>(null)
    facade = {
      definition: {
        titleKey: 'PAC.Chat.ClawXpert.DetailTitle',
        defaultTitle: 'ClawXpert'
      },
      loading: signal(false),
      loadingUserPreference: signal(false),
      viewState: signal('ready'),
      resolvedPreference: signal({ assistantId: 'assistant-1' }),
      xpertId: signal('assistant-1'),
      chatkitFrameUrl: signal('https://frame.example.com'),
      threadId: signal('thread-1'),
      suppressAutoResume: signal(false),
      pendingConversationStartId: signal(0),
      activeConversation,
      onChatThreadChange: jest.fn(),
      beginPendingConversation: jest.fn(),
      ensureConversationEntry: jest.fn(),
      navigateToOverview: jest.fn(),
      setActiveConversation: jest.fn((conversation: IChatConversation | null) => {
        activeConversation.set(conversation)
      }),
      patchActiveConversationStatus: jest.fn((status: 'busy' | 'idle') => {
        activeConversation.update((conversation) =>
          conversation
            ? ({
                ...conversation,
                status
              } as IChatConversation)
            : conversation
        )
      })
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
          projectId: 'project-1',
          status: 'idle',
          messages: []
        } as IChatConversation)
      ),
      getById: jest.fn(() =>
        of({
          id: 'conversation-1',
          projectId: 'project-1',
          status: 'idle',
          messages: []
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

  it('renders the files panel and resolves the current conversation context from the thread', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(aiThreadService.getThread).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).toHaveBeenCalledWith('conversation-1', { relations: ['messages'] })
    expect(facade.setActiveConversation).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'conversation-1' }))
    expect(filesPanel).not.toBeNull()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).conversationId).toBe('conversation-1')
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).xpertId).toBe('assistant-1')
  })

  it('keeps the active panel open when its tab is clicked again', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    fixture.detectChanges()

    expect(fixture.componentInstance.activePanel()).toBe('files')
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()
  })

  it('does not pin computer and terminal tabs before the user adds them', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(fixture.nativeElement.querySelector('[data-panel-button="files"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-panel-button="computer"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-panel-button="terminal"]')).toBeNull()
  })

  it('does not allow closing the last remaining workspace tab', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const onlyTabId = fixture.componentInstance.activeTabId()
    expect(fixture.nativeElement.querySelector(`[data-close-tab="${onlyTabId}"]`)).toBeNull()

    fixture.componentInstance.closeWorkspaceTab(new MouseEvent('click'), onlyTabId)
    await settle(fixture)

    expect(fixture.componentInstance.workspaceTabs()).toHaveLength(1)
    expect(fixture.componentInstance.activeTabId()).toBe(onlyTabId)
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()
  })

  it('adds and closes file computer and terminal tabs on demand', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    const component = fixture.componentInstance as WorkspaceTabTestComponent
    await settle(fixture)

    const computerTab = component.addWorkspaceTab('computer')
    await settle(fixture)

    expect(component.activeTab()?.kind).toBe('computer')
    expect(fixture.nativeElement.querySelector('[data-panel-button="computer"]')).not.toBeNull()
    expect(fixture.debugElement.query(By.directive(ChatComputerTimelineComponent))).not.toBeNull()

    const terminalTab = component.addWorkspaceTab('terminal')
    await settle(fixture)

    expect(component.activeTab()?.kind).toBe('terminal')
    expect(fixture.nativeElement.querySelector('[data-panel-button="terminal"]')).not.toBeNull()
    expect(fixture.debugElement.query(By.directive(ChatSharedTerminalComponent))).not.toBeNull()

    const fileTab = component.addWorkspaceTab('files')
    await settle(fixture)

    expect(component.activeTab()?.kind).toBe('files')
    expect(fixture.nativeElement.querySelector(`[data-tab-id="${fileTab.id}"]`)).not.toBeNull()
    ;(fixture.nativeElement.querySelector(`[data-close-tab="${terminalTab.id}"]`) as HTMLElement).click()
    await settle(fixture)

    expect(fixture.nativeElement.querySelector(`[data-tab-id="${terminalTab.id}"]`)).toBeNull()
    expect(fixture.nativeElement.querySelector(`[data-tab-id="${computerTab.id}"]`)).not.toBeNull()
  })

  it('renders the terminal panel with the resolved conversation and project context', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.selectPanel('terminal')
    await settle(fixture)

    const terminal = fixture.debugElement.query(By.directive(ChatSharedTerminalComponent))
    expect(terminal).not.toBeNull()
    expect((terminal.componentInstance as ChatSharedTerminalComponent).mode).toBe('interactive')
    expect((terminal.componentInstance as ChatSharedTerminalComponent).conversationId).toBe('conversation-1')
    expect((terminal.componentInstance as ChatSharedTerminalComponent).projectId).toBe('project-1')
  })

  it('renders the computer panel with the resolved conversation detail', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.selectPanel('computer')
    await settle(fixture)

    const computerTimeline = fixture.debugElement.query(By.directive(ChatComputerTimelineComponent))
    expect(computerTimeline).not.toBeNull()
    expect((computerTimeline.componentInstance as ChatComputerTimelineComponent).conversation).toEqual(
      expect.objectContaining({ id: 'conversation-1' })
    )
    expect((computerTimeline.componentInstance as ChatComputerTimelineComponent).projectId).toBe('project-1')
  })

  it('adds a browser tab with the resolved conversation context', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.selectPanel('preview')
    await settle(fixture)

    const preview = fixture.debugElement.query(By.directive(ClawXpertConversationPreviewComponent))
    const activeTab = fixture.componentInstance.activeTab()
    expect(preview).not.toBeNull()
    expect(activeTab?.kind).toBe('browser')
    expect((preview.componentInstance as ClawXpertConversationPreviewComponent).conversationId).toBe('conversation-1')
  })

  it('keeps browser tab labels and state independent across multiple browser tabs', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.selectPanel('preview')
    await settle(fixture)
    const firstBrowserId = fixture.componentInstance.activeTabId()
    let preview = fixture.debugElement.query(By.directive(ClawXpertConversationPreviewComponent))
    ;(preview.componentInstance as ClawXpertConversationPreviewComponent).browserStateChange.emit({
      displayUrl: 'localhost:3000',
      serviceId: 'service-3000',
      zoom: 125
    })
    await settle(fixture)

    fixture.componentInstance.addBrowserTab()
    await settle(fixture)
    const secondBrowserId = fixture.componentInstance.activeTabId()
    preview = fixture.debugElement.query(By.directive(ClawXpertConversationPreviewComponent))
    ;(preview.componentInstance as ClawXpertConversationPreviewComponent).browserStateChange.emit({
      displayUrl: 'localhost:8080',
      serviceId: 'service-8080',
      zoom: 90
    })
    await settle(fixture)

    expect(firstBrowserId).not.toBe(secondBrowserId)
    expect(fixture.nativeElement.textContent).toContain('localhost:3000')
    expect(fixture.nativeElement.textContent).toContain('localhost:8080')

    fixture.nativeElement.querySelector(`[data-tab-id="${firstBrowserId}"]`).click()
    await settle(fixture)

    preview = fixture.debugElement.query(By.directive(ClawXpertConversationPreviewComponent))
    expect((preview.componentInstance as ClawXpertConversationPreviewComponent).serviceId).toBe('service-3000')
    expect((preview.componentInstance as ClawXpertConversationPreviewComponent).zoom).toBe(125)
  })

  it('transitions the layout into a main workspace with a right-side chat dialog when a panel opens', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const chatShell = fixture.nativeElement.querySelectorAll('section')[1]?.querySelector('div') as HTMLElement | null
    const tabHeader = fixture.nativeElement.querySelector('[data-workspace-tab-header]') as HTMLElement | null
    const tabNav = fixture.nativeElement.querySelector('nav[z-tab-nav-bar]') as HTMLElement | null
    const addTabButton = fixture.nativeElement.querySelector('[data-add-workspace-tab]') as HTMLElement | null

    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain(
      'xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]'
    )
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain(
      'grid-rows-[minmax(0,1fr)_minmax(24rem,32rem)]'
    )
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('xl:grid-rows-1')
    expect(fixture.componentInstance.chatShellClasses()).toContain('xl:max-w-[32rem]')
    expect(fixture.componentInstance.detailPanelShellClasses()).toContain('opacity-100')
    expect(chatShell?.className).toContain('rounded-3xl')
    expect(tabHeader?.className).toContain('pt-1')
    expect(tabHeader?.className).not.toContain('pt-4')
    expect(tabHeader?.className).not.toContain('flex-col')
    expect(tabNav).not.toBeNull()
    expect(tabNav?.className).toContain('flex-1')
    expect(tabNav?.className).toContain('min-w-0')
    expect(tabNav?.contains(addTabButton)).toBe(false)
    expect(addTabButton?.className).toContain('h-8')
    expect(addTabButton?.className).toContain('w-8')
  })

  it('allows the embedded chatkit to shrink within compact viewport heights', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const chatkit = fixture.nativeElement.querySelector('xpert-chatkit') as HTMLElement | null
    const chatkitClasses = Array.from(chatkit?.classList ?? [])

    expect(chatkit).not.toBeNull()
    expect(chatkitClasses).toEqual(expect.arrayContaining(['block', 'h-full', 'min-h-0']))
    expect(chatkitClasses).not.toContain('min-h-[32rem]')
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

    fixture.componentInstance.selectPanel('terminal')
    await settle(fixture)

    const terminal = fixture.debugElement.query(By.directive(ChatSharedTerminalComponent))
    expect(conversationService.getByThreadId).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).toHaveBeenCalledWith('conversation-1', { relations: ['messages'] })
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
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).xpertId).toBe('assistant-1')
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
        setThreadId: jest.fn().mockResolvedValue(undefined),
        setComposerValue: jest.fn().mockResolvedValue(undefined),
        focusComposer: jest.fn().mockResolvedValue(undefined)
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

  it('appends workspace file path references to the chatkit composer without sending a message', async () => {
    const setComposerValue = jest.fn().mockResolvedValue(undefined)
    const focusComposer = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        setComposerValue,
        focusComposer
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()
    ;(filesPanel.componentInstance as ClawXpertConversationFilesComponent).referenceRequest.emit({
      type: 'file_path',
      path: 'screenshots/home.png'
    })
    await settle(fixture)

    expect(setComposerValue).toHaveBeenCalledWith({
      references: [
        {
          type: 'quote',
          label: 'screenshots/home.png',
          source: 'Workspace file',
          text: 'screenshots/home.png'
        }
      ],
      appendReferences: true
    })
    expect(focusComposer).toHaveBeenCalled()
  })

  it('appends selected workspace text references to the chatkit composer without sending a message', async () => {
    const setComposerValue = jest.fn().mockResolvedValue(undefined)
    const focusComposer = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        setComposerValue,
        focusComposer
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()
    ;(filesPanel.componentInstance as ClawXpertConversationFilesComponent).referenceRequest.emit({
      path: 'src/app.ts',
      text: 'const y = 2',
      startLine: 2,
      endLine: 2,
      language: 'typescript'
    })
    await settle(fixture)

    expect(setComposerValue).toHaveBeenCalledWith({
      references: [
        {
          type: 'code',
          path: 'src/app.ts',
          text: 'const y = 2',
          startLine: 2,
          endLine: 2,
          language: 'typescript'
        }
      ],
      appendReferences: true
    })
    expect(focusComposer).toHaveBeenCalled()
  })

  it('appends html file element references to the chatkit composer', async () => {
    const setComposerValue = jest.fn().mockResolvedValue(undefined)
    const focusComposer = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        setComposerValue,
        focusComposer
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(filesPanel).not.toBeNull()
    ;(filesPanel.componentInstance as ClawXpertConversationFilesComponent).referenceRequest.emit({
      type: 'file_element',
      attributes: [{ name: 'id', value: 'hero' }],
      domPath: 'html > body > button',
      filePath: 'index.html',
      outerHtml: '<button id="hero">Launch</button>',
      selector: '#hero',
      tagName: 'button',
      text: 'Launch'
    })
    await settle(fixture)

    expect(setComposerValue).toHaveBeenCalledWith({
      references: [
        expect.objectContaining({
          type: 'quote',
          label: 'button #hero',
          source: 'index.html'
        })
      ],
      appendReferences: true
    })
    const reference = setComposerValue.mock.calls.at(-1)?.[0].references[0] as { text: string }
    expect(reference.text).toContain('Reference type: Target inspected HTML file element')
    expect(reference.text).toContain(
      'Scope: This reference is the currently inspected element only, not the entire file.'
    )
    expect(reference.text).toContain(
      'Action target: Apply to THIS inspected element only; do not change the rest of the file/page unless explicitly asked.'
    )
    expect(reference.text).toContain('Source location: index.html')
    expect(reference.text).toContain('- Selector: #hero')
    expect(reference.text).toContain('- DOM path: html > body > button')
    expect(reference.text).toContain('Inspected element outerHTML:')
    expect(reference.text).toContain('<button id="hero">Launch</button>')
    expect(focusComposer).toHaveBeenCalled()
  })

  it('appends selected preview element references to the chatkit composer', async () => {
    const setComposerValue = jest.fn().mockResolvedValue(undefined)
    const focusComposer = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        setComposerValue,
        focusComposer
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.selectPanel('preview')
    await settle(fixture)

    const preview = fixture.debugElement.query(By.directive(ClawXpertConversationPreviewComponent))
    expect(preview).not.toBeNull()
    ;(preview.componentInstance as ClawXpertConversationPreviewComponent).referenceRequest.emit({
      attributes: [
        {
          name: 'data-testid',
          value: 'hero-title'
        }
      ],
      outerHtml: '<h1 data-testid="hero-title">Hello</h1>',
      pageTitle: 'Preview Page',
      pageUrl: 'http://localhost:4173/',
      selector: 'main > h1',
      serviceId: 'service-1',
      tagName: 'h1',
      text: 'Hello',
      type: 'element'
    })
    await settle(fixture)

    expect(setComposerValue).toHaveBeenCalledWith({
      references: [
        expect.objectContaining({
          type: 'quote',
          label: 'h1 main > h1',
          source: 'Preview Page'
        })
      ],
      appendReferences: true
    })
    const reference = setComposerValue.mock.calls.at(-1)?.[0].references[0] as { text: string }
    expect(reference.text).toContain('Reference type: Target inspected page element')
    expect(reference.text).toContain(
      'Action target: Apply to THIS inspected element only; do not change the rest of the file/page unless explicitly asked.'
    )
    expect(reference.text).toContain('URL: http://localhost:4173/')
    expect(reference.text).toContain('Selector: main > h1')
    expect(reference.text).toContain('<h1 data-testid="hero-title">Hello</h1>')
    expect(focusComposer).toHaveBeenCalled()
  })

  it('polls and refreshes conversation detail for the computer tab while responses are in flight', async () => {
    jest.useFakeTimers()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settleWithFakeTimers(fixture)

    fixture.componentInstance.selectPanel('computer')
    await settleWithFakeTimers(fixture)

    const runtimeInput = getRuntimeInput()
    conversationService.getById.mockClear()

    runtimeInput.onResponseStart?.()
    fixture.detectChanges()

    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    await Promise.resolve()
    fixture.detectChanges()

    expect(conversationService.getById).toHaveBeenCalledTimes(1)
    expect(conversationService.getById).toHaveBeenLastCalledWith('conversation-1', { relations: ['messages'] })

    runtimeInput.onResponseEnd?.()
    await Promise.resolve()
    await Promise.resolve()
    fixture.detectChanges()

    expect(conversationService.getById).toHaveBeenCalledTimes(2)
    expect(conversationService.getById).toHaveBeenLastCalledWith('conversation-1', { relations: ['messages'] })
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

  it('waits for user preferences to finish loading before resolving the preferred conversation entry', async () => {
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId: jest.fn().mockResolvedValue(undefined),
        focusComposer: jest.fn()
      })
    )
    facade.threadId.set(null)
    facade.loadingUserPreference.set(true)

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(facade.ensureConversationEntry).not.toHaveBeenCalled()

    facade.loadingUserPreference.set(false)
    await settle(fixture)

    expect(facade.ensureConversationEntry).toHaveBeenCalledTimes(1)
  })

  it('passes the resumed thread into the chatkit runtime as initialThread instead of pushing setThreadId', async () => {
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

    const runtimeInput = getRuntimeInput()
    expect(runtimeInput.initialThread?.()).toBeNull()
    expect(setThreadId).not.toHaveBeenCalled()

    facade.threadId.set('thread-2')
    await settle(fixture)

    expect(runtimeInput.initialThread?.()).toBe('thread-2')
    expect(setThreadId).not.toHaveBeenCalled()
  })

  it('does not push a chatkit-originated new thread id back into the control', async () => {
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

    setThreadId.mockClear()

    const runtimeInput = getRuntimeInput()
    runtimeInput.onThreadChange?.({ threadId: 'thread-new' })
    facade.threadId.set('thread-new')
    await settle(fixture)

    expect(facade.onChatThreadChange).toHaveBeenCalledWith('thread-new')
    expect(setThreadId).not.toHaveBeenCalledWith('thread-new')
  })

  it('passes the file list reload key to the files panel and refreshes it after relevant log events', async () => {
    jest.useFakeTimers()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settleWithFakeTimers(fixture)

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

  it('opens a browser tab when a sandbox service start tool log arrives', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()

    const runtimeInput = getRuntimeInput()
    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        payload: {
          item: {
            tool: 'sandbox_service_start',
            output: JSON.stringify({
              id: 'service-1',
              actualPort: 3000,
              previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
            })
          }
        }
      }
    })
    await settle(fixture)

    const preview = fixture.debugElement.query(By.directive(ClawXpertConversationPreviewComponent))
    expect(fixture.componentInstance.activeTab()?.kind).toBe('browser')
    expect(preview).not.toBeNull()
    expect(fixture.nativeElement.textContent).toContain('localhost:3000')
    expect((preview.componentInstance as ClawXpertConversationPreviewComponent).conversationId).toBe('conversation-1')
    expect((preview.componentInstance as ClawXpertConversationPreviewComponent).serviceId).toBe('service-1')
    expect((preview.componentInstance as ClawXpertConversationPreviewComponent).url).toBe('localhost:3000')
  })

  it('debounces multiple relevant log events into a single file list refresh', async () => {
    jest.useFakeTimers()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settleWithFakeTimers(fixture)

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
    await settleWithFakeTimers(fixture)

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
    await settleWithFakeTimers(fixture)

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
