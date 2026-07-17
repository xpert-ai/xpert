jest.mock('../../../@core', () => ({
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  AiThreadService: class AiThreadService {},
  ArtifactService: class ArtifactService {},
  ChatConversationService: class ChatConversationService {},
  ViewExtensionApiService: class ViewExtensionApiService {},
  getErrorMessage: (error: any) => error?.message ?? '',
  injectToastr: () => ({
    warning: jest.fn(),
    danger: jest.fn(),
    error: jest.fn()
  })
}))

jest.mock('../../assistant/workbench-file-preview-dialog.component', () => ({
  openWorkbenchFilePreviewDialog: jest.fn()
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

  @Directive({
    standalone: true,
    selector: '[zTooltip]'
  })
  class ZardTooltipDirective {
    @Input() zTooltip?: string
    @Input() zPosition?: string
  }

  return {
    ZardButtonComponent,
    ZardIconComponent,
    ZardMenuImports: [ZardMenuDirective, ZardMenuContentDirective, ZardMenuItemDirective],
    ZardTabsImports: [ZardTabNavBarDirective, ZardTabLinkDirective, ZardTabNavPanelComponent],
    ZardTooltipImports: [ZardTooltipDirective]
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

jest.mock('../tasks/tasks.component', () => {
  const { Component, EventEmitter, Input, Output } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-chat-tasks',
    template: ''
  })
  class ChatTasksComponent {
    @Input() embedded?: boolean
    @Input() xpertId?: string | null
    @Output() tasksChanged = new EventEmitter<void>()
    @Output() conversationSelected = new EventEmitter()
  }

  return {
    ChatTasksComponent
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

jest.mock('../../../@shared/view-extension', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xp-extension-host-outlet',
    template: '<div data-extension-host-outlet></div>'
  })
  class ExtensionHostOutletComponent {
    @Input() mode?: string
    @Input() hostType?: string
    @Input() hostId?: string | null
    @Input() slot?: string
    @Input() viewKey?: string | null
    @Input() fillAvailableHeight?: boolean
  }

  return {
    ExtensionHostOutletComponent
  }
})

jest.mock('./clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

import { Component, Input, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import {
  WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type IconDefinition,
  type XpertExtensionViewManifest
} from '@xpert-ai/contracts'
import { of } from 'rxjs'
import {
  AiThreadService,
  ArtifactService,
  ChatConversationService,
  IChatConversation,
  ViewExtensionApiService
} from '../../../@core'
import { ChatSharedTerminalComponent } from '../../../@shared/chat/terminal/terminal.component'
import { ExtensionHostOutletComponent } from '../../../@shared/view-extension'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import { ViewHostEventBus } from '../../../@shared/view-extension/view-host-event-bus.service'
import { ChatTasksComponent } from '../tasks/tasks.component'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import { ClawXpertConversationPreviewComponent } from './clawxpert-conversation-preview.component'
import { ClawXpertSkillTrialIntentService } from './clawxpert-skill-trial-intent.service'
import { ClawXpertFacade } from './clawxpert.facade'

const TEST_LAYOUT_ICON = {
  type: 'font',
  value: 'ri-layout-grid-line',
  alt: 'Layout'
} satisfies IconDefinition

const TEST_LINE_CHART_ICON = {
  type: 'font',
  value: 'ri-line-chart-line',
  alt: 'Metrics'
} satisfies IconDefinition

const TEST_FILE_LIST_ICON = {
  type: 'font',
  value: 'ri-file-list-3-line',
  alt: 'BOM Review'
} satisfies IconDefinition

jest.mock('../../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    injectHostedAssistantChatkitControl: jest.fn(() => signal(null))
  }
})

const runtimeModule = jest.requireMock('../../assistant/assistant-chatkit.runtime') as {
  injectHostedAssistantChatkitControl: jest.Mock
}
const filePreviewModule = jest.requireMock('../../assistant/workbench-file-preview-dialog.component') as {
  openWorkbenchFilePreviewDialog: jest.Mock
}

type MockChatKitEvent = {
  name: string
  data?: object
}

type MockChatKitRuntimeInput = {
  initialThread?: () => string | null
  layout?: {
    maxWidth?: number | string
  }
  taskSummary?: {
    enabled?: boolean
  }
  requestContext?: () => Record<string, unknown> | null
  onThreadChange?: (event: { threadId: string | null }) => void
  onThreadLoadStart?: (event: { threadId: string | null }) => void
  onThreadLoadEnd?: (event: { threadId: string | null }) => void
  onEffect?: (event: MockChatKitEvent) => void
  onLog?: (event: MockChatKitEvent) => void
  onResponseStart?: () => void
  onResponseEnd?: () => void
}

type WorkspaceTabKindForTest = 'files' | 'terminal' | 'browser'
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

function buildFixedViewManifest(
  key: string,
  overrides: Partial<XpertExtensionViewManifest> = {}
): XpertExtensionViewManifest {
  return {
    key,
    title: {
      en_US: key,
      zh_Hans: key
    },
    description: {
      en_US: `${key} description`,
      zh_Hans: `${key} 描述`
    },
    icon: TEST_LAYOUT_ICON,
    hostType: 'agent',
    slot: 'agent.workbench.fixed',
    order: 50,
    source: {
      provider: 'test-provider'
    },
    workbench: {
      fixed: true,
      menu: {
        enabled: true
      }
    },
    view: {
      type: 'raw_json'
    },
    dataSource: {
      mode: 'platform'
    },
    ...overrides
  }
}

describe('ClawXpertConversationDetailComponent', () => {
  let facade: {
    definition: { titleKey: string; defaultTitle: string }
    identity: ReturnType<typeof signal<string | null>>
    assistantId: ReturnType<typeof signal<string | null>>
    loading: ReturnType<typeof signal<boolean>>
    loadingUserPreference: ReturnType<typeof signal<boolean>>
    viewState: ReturnType<typeof signal<'ready' | 'wizard' | 'error' | 'organization-required'>>
    resolvedPreference: ReturnType<typeof signal<{ assistantId: string } | null>>
    xpertId: ReturnType<typeof signal<string | null>>
    currentWorkspaceId: ReturnType<typeof signal<string | null>>
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
    refreshTaskSummaries: jest.Mock
  }
  let aiThreadService: {
    getThread: jest.Mock
  }
  let conversationService: {
    getByThreadId: jest.Mock
    getById: jest.Mock
    markRead: jest.Mock
    getFile: jest.Mock
  }
  let artifactService: {
    createSignedPreviewLink: jest.Mock
  }
  let viewExtensionApi: {
    getSlotViews: jest.Mock
  }
  let skillTrialIntent: {
    peek: jest.Mock
    consume: jest.Mock
    set: jest.Mock
    clear: jest.Mock
  }
  let hostEvents: ViewHostEventBus

  beforeEach(async () => {
    skillTrialIntent = {
      peek: jest.fn(() => null),
      consume: jest.fn(() => null),
      set: jest.fn(),
      clear: jest.fn()
    }
    const activeConversation = signal<IChatConversation | null>(null)
    facade = {
      definition: {
        titleKey: 'PAC.Chat.ClawXpert.DetailTitle',
        defaultTitle: 'ClawXpert'
      },
      identity: signal('clawxpert'),
      assistantId: signal('assistant-1'),
      loading: signal(false),
      loadingUserPreference: signal(false),
      viewState: signal('ready'),
      resolvedPreference: signal({ assistantId: 'assistant-1' }),
      xpertId: signal('assistant-1'),
      currentWorkspaceId: signal('workspace-1'),
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
      }),
      refreshTaskSummaries: jest.fn()
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
      ),
      markRead: jest.fn(() => of({})),
      getFile: jest.fn(() =>
        of({
          filePath: '/workspace/report.pdf',
          fileUrl: 'https://files.example.com/report.pdf',
          mimeType: 'application/pdf',
          size: 2 * 1024 * 1024
        })
      )
    }
    artifactService = {
      createSignedPreviewLink: jest.fn(() =>
        of({
          id: 'link-1',
          artifactId: 'artifact-1',
          publicUrl: 'https://artifacts.example.com/report.pdf',
          version: { mimeType: 'application/pdf', fileName: 'report.pdf', size: 3 * 1024 * 1024 }
        })
      )
    }
    viewExtensionApi = {
      getSlotViews: jest.fn(() => of([]))
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
        },
        {
          provide: ArtifactService,
          useValue: artifactService
        },
        {
          provide: ViewExtensionApiService,
          useValue: viewExtensionApi
        },
        {
          provide: ClawXpertSkillTrialIntentService,
          useValue: skillTrialIntent
        }
      ]
    }).compileComponents()

    hostEvents = TestBed.inject(ViewHostEventBus)
  })

  afterEach(() => {
    jest.useRealTimers()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('keeps the detail panel closed by default while resolving the current conversation context', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(viewExtensionApi.getSlotViews).toHaveBeenCalledWith('agent', 'assistant-1', 'agent.workbench.fixed')
    expect(aiThreadService.getThread).toHaveBeenCalledWith('thread-1')
    expect(conversationService.getById).toHaveBeenCalledWith('conversation-1', { relations: ['messages'] })
    expect(facade.setActiveConversation).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'conversation-1' }))
    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.componentInstance.detailPanelShellClasses()).toContain('opacity-0')
    expect(fixture.componentInstance.detailPanelContentClasses()).toContain('opacity-0')
    expect(fixture.componentInstance.detailPanelContentClasses()).toContain('pointer-events-none')

    const hiddenFilesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(hiddenFilesPanel).not.toBeNull()
    expect((hiddenFilesPanel.componentInstance as ClawXpertConversationFilesComponent).conversationId).toBe(
      'conversation-1'
    )
    ;(fixture.nativeElement.querySelector('[data-toggle-detail-panel]') as HTMLButtonElement).click()
    await settle(fixture)

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(fixture.componentInstance.detailPanelContentClasses()).toContain('opacity-100')
    expect(filesPanel).not.toBeNull()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).conversationId).toBe('conversation-1')
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).xpertId).toBe('assistant-1')
    ;(fixture.nativeElement.querySelector('[data-toggle-detail-panel]') as HTMLButtonElement).click()
    await settle(fixture)

    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.componentInstance.detailPanelContentClasses()).toContain('opacity-0')
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()
  })

  it('consumes a skill trial intent by opening a new ChatKit run with only that skill selected', async () => {
    const intent = {
      workspaceId: 'workspace-1',
      skillPackageId: 'skill-package-documents',
      label: 'Documents',
      prompt: 'Draft a project memo as a document',
      createdAt: Date.now()
    }
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    const setRuntimeCapabilities = jest.fn().mockResolvedValue(undefined)
    const setComposerValue = jest.fn().mockResolvedValue(undefined)
    const focusComposer = jest.fn().mockResolvedValue(undefined)
    skillTrialIntent.peek.mockReturnValue(intent)
    skillTrialIntent.consume.mockReturnValue(intent)
    facade.threadId.set(null)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        setRuntimeCapabilities,
        setComposerValue,
        focusComposer
      })
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await settle(fixture)

    expect(skillTrialIntent.consume).toHaveBeenCalled()
    expect(setThreadId).toHaveBeenCalledWith(null)
    const expectedSelection = {
      mode: 'allowlist',
      skills: {
        workspaceId: 'workspace-1',
        ids: ['skill-package-documents']
      },
      plugins: {
        nodeKeys: []
      },
      subAgents: {
        nodeKeys: []
      }
    }
    expect(setRuntimeCapabilities).toHaveBeenCalledWith(expectedSelection)
    expect(setComposerValue).toHaveBeenCalledWith({
      text: 'Draft a project memo as a document',
      runtimeCapabilities: expectedSelection,
      insertRuntimeCapabilities: true
    })
    expect(focusComposer).toHaveBeenCalled()
    expect(facade.suppressAutoResume()).toBe(true)
  })

  it('limits the embedded ChatKit column width for wide ClawXpert conversations', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(getRuntimeInput().layout).toEqual({
      maxWidth: '960px'
    })
  })

  it('enables the task summary only for the ClawXpert ChatKit runtime', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(getRuntimeInput().taskSummary).toEqual({ enabled: true })
  })

  it('opens task summary workspace files with the existing file preview', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    getRuntimeInput().onEffect?.({
      name: 'task_summary.open_resource',
      data: {
        conversationId: 'conversation-1',
        title: 'Report',
        resource: {
          type: 'workspace_file',
          workspacePath: '/workspace/report.pdf',
          fileAssetId: 'file-1'
        }
      }
    })
    await settle(fixture)

    expect(conversationService.getFile).toHaveBeenCalledWith(
      'conversation-1',
      '/workspace/report.pdf',
      undefined,
      'file-1',
      true
    )
    expect(filePreviewModule.openWorkbenchFilePreviewDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'file-1',
        name: 'Report',
        size: 2 * 1024 * 1024,
        url: 'https://files.example.com/report.pdf'
      })
    )
  })

  it('creates an artifact signed preview only when the task summary item is clicked', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(artifactService.createSignedPreviewLink).not.toHaveBeenCalled()
    getRuntimeInput().onEffect?.({
      name: 'task_summary.open_resource',
      data: {
        conversationId: 'conversation-1',
        resource: { type: 'artifact', artifactId: 'artifact-1' }
      }
    })
    await settle(fixture)

    expect(artifactService.createSignedPreviewLink).toHaveBeenCalledWith('artifact-1')
    expect(filePreviewModule.openWorkbenchFilePreviewDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'artifact-1',
        size: 3 * 1024 * 1024,
        url: 'https://artifacts.example.com/report.pdf'
      })
    )
  })

  it('opens validated task summary URLs in the existing Browser tab', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    getRuntimeInput().onEffect?.({
      name: 'task_summary.open_resource',
      data: {
        conversationId: 'conversation-1',
        title: 'Preview',
        resource: { type: 'url', url: 'https://example.com/preview' }
      }
    })
    fixture.detectChanges()

    expect(fixture.componentInstance.activeBrowserTab()).toEqual(
      expect.objectContaining({
        displayUrl: 'Preview',
        url: 'https://example.com/preview'
      })
    )
  })

  it('marks a route-resolved conversation read without waiting for ChatKit thread load callbacks', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(conversationService.markRead).toHaveBeenCalledWith('conversation-1')
  })

  it('marks a conversation read when ChatKit finishes loading the visible thread', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    conversationService.markRead.mockClear()

    runtimeInput.onThreadLoadEnd?.({ threadId: 'thread-1' })
    await settle(fixture)

    expect(conversationService.markRead).toHaveBeenCalledWith('conversation-1')
  })

  it('passes remote assistant context client commands into the current ChatKit request context', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const registry = TestBed.inject(ViewClientCommandRegistry)
    const result = await registry.execute(
      'assistant.context.set',
      {
        key: 'docxEditor',
        env: {
          docxEditorDocumentId: 'doc-1',
          docxEditorVersionId: 'version-1',
          docxEditorWorkspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v1-deadbeef.docx'
        },
        context: {
          currentDocument: {
            documentId: 'doc-1',
            title: '技术通知单',
            currentVersionId: 'version-1',
            currentVersionNumber: 1,
            workspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v1-deadbeef.docx',
            selection: {
              selectedText: 'selected text'
            }
          }
        }
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'docx-editor',
        manifest: buildFixedViewManifest('docx-editor')
      }
    )
    await settle(fixture)

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        status: 'updated',
        key: 'docxEditor'
      })
    )
    expect(getRuntimeInput().requestContext?.()).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          workspaceId: 'workspace-1',
          xpertId: 'assistant-1',
          docxEditorDocumentId: 'doc-1',
          docxEditorVersionId: 'version-1',
          docxEditorWorkspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v1-deadbeef.docx'
        }),
        docxEditor: expect.objectContaining({
          currentDocument: expect.objectContaining({
            documentId: 'doc-1',
            currentVersionId: 'version-1',
            workspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v1-deadbeef.docx',
            selection: expect.objectContaining({
              selectedText: 'selected text'
            })
          })
        })
      })
    )
  })

  it('filters and orders fixed view menu items from the current bound xpert', async () => {
    viewExtensionApi.getSlotViews.mockReturnValue(
      of([
        buildFixedViewManifest('metrics', {
          order: 40,
          workbench: {
            fixed: true,
            menu: {
              enabled: true,
              label: {
                en_US: 'Metrics',
                zh_Hans: '指标'
              },
              order: 30,
              icon: TEST_LINE_CHART_ICON
            }
          }
        }),
        buildFixedViewManifest('hidden', {
          visible: false
        }),
        buildFixedViewManifest('not-fixed', {
          workbench: {
            fixed: false,
            menu: {
              enabled: true
            }
          }
        }),
        buildFixedViewManifest('disabled-menu', {
          workbench: {
            fixed: true,
            menu: {
              enabled: false
            }
          }
        }),
        buildFixedViewManifest('bom', {
          order: 20,
          title: {
            en_US: 'BOM Review',
            zh_Hans: 'BOM 审核台'
          },
          workbench: {
            fixed: true,
            menu: {
              enabled: true,
              order: 10
            }
          }
        })
      ])
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(fixture.componentInstance.fixedViewMenuItems()).toEqual([
      expect.objectContaining({
        viewKey: 'bom',
        title: 'BOM Review',
        order: 10
      }),
      expect.objectContaining({
        viewKey: 'metrics',
        title: 'Metrics',
        icon: TEST_LINE_CHART_ICON,
        order: 30
      })
    ])
    expect(fixture.componentInstance.workspaceTabs()).toEqual([
      expect.objectContaining({
        kind: 'fixed-view',
        viewKey: 'bom'
      }),
      expect.objectContaining({
        kind: 'fixed-view',
        viewKey: 'metrics'
      })
    ])
    expect(fixture.componentInstance.activeTab()).toEqual(
      expect.objectContaining({
        kind: 'fixed-view',
        viewKey: 'bom'
      })
    )
    expect(fixture.componentInstance.showDetailPanel()).toBe(true)
    expect(fixture.nativeElement.querySelector('[data-panel-button="files"]')).toBeNull()
  })

  it('opens fixed views as reusable workspace tabs rendered through the extension host outlet', async () => {
    viewExtensionApi.getSlotViews.mockReturnValue(
      of([
        buildFixedViewManifest('bom_document_intake__review', {
          title: {
            en_US: 'BOM Review',
            zh_Hans: 'BOM 审核台'
          },
          icon: TEST_FILE_LIST_ICON
        })
      ])
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    let fixedViewTabs = fixture.componentInstance.workspaceTabs().filter((tab) => tab.kind === 'fixed-view')
    let outlet = fixture.debugElement.query(By.directive(ExtensionHostOutletComponent))

    expect(fixedViewTabs).toHaveLength(1)
    expect(fixture.componentInstance.workspaceTabs().some((tab) => tab.kind === 'files')).toBe(false)
    expect(fixture.componentInstance.activeTab()).toEqual(
      expect.objectContaining({
        kind: 'fixed-view',
        viewKey: 'bom_document_intake__review',
        title: 'BOM Review',
        icon: TEST_FILE_LIST_ICON
      })
    )
    expect(fixture.componentInstance.showDetailPanel()).toBe(true)
    expect(outlet).not.toBeNull()
    expect(outlet.componentInstance).toEqual(
      expect.objectContaining({
        mode: 'single-view',
        hostType: 'agent',
        hostId: 'assistant-1',
        slot: 'agent.workbench.fixed',
        viewKey: 'bom_document_intake__review',
        fillAvailableHeight: true
      })
    )

    fixture.componentInstance.openFixedViewTab(fixture.componentInstance.fixedViewMenuItems()[0])
    await settle(fixture)

    fixedViewTabs = fixture.componentInstance.workspaceTabs().filter((tab) => tab.kind === 'fixed-view')
    outlet = fixture.debugElement.query(By.directive(ExtensionHostOutletComponent))
    expect(fixedViewTabs).toHaveLength(1)
    expect(outlet.componentInstance.viewKey).toBe('bom_document_intake__review')
  })

  it('renders a fixed view even when the thread conversation context cannot be resolved', async () => {
    aiThreadService.getThread.mockReturnValue(
      of({
        thread_id: 'thread-1',
        metadata: {}
      })
    )
    conversationService.getByThreadId.mockReturnValue(of(null))
    viewExtensionApi.getSlotViews.mockReturnValue(
      of([
        buildFixedViewManifest('metrics__management', {
          title: {
            en_US: 'Metric Management',
            zh_Hans: '指标管理'
          }
        })
      ])
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.openFixedViewTab(fixture.componentInstance.fixedViewMenuItems()[0])
    await settle(fixture)

    expect(fixture.debugElement.query(By.directive(ExtensionHostOutletComponent))).not.toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Chat.ClawXpert.DetailPanelEmptyTitle')
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).toBeNull()
  })

  it('clears fixed view menu and tabs when the bound xpert becomes unavailable', async () => {
    viewExtensionApi.getSlotViews.mockReturnValue(
      of([
        buildFixedViewManifest('metrics__management', {
          title: {
            en_US: 'Metric Management',
            zh_Hans: '指标管理'
          }
        })
      ])
    )

    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.openFixedViewTab(fixture.componentInstance.fixedViewMenuItems()[0])
    await settle(fixture)
    expect(fixture.componentInstance.workspaceTabs().some((tab) => tab.kind === 'fixed-view')).toBe(true)

    facade.xpertId.set(null)
    await settle(fixture)

    expect(fixture.componentInstance.fixedViewMenuItems()).toEqual([])
    expect(fixture.componentInstance.workspaceTabs().some((tab) => tab.kind === 'fixed-view')).toBe(false)
    expect(fixture.debugElement.query(By.directive(ExtensionHostOutletComponent))).toBeNull()
  })

  it('keeps the active panel open when its tab is clicked again', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    fixture.componentInstance.openDetailPanel()
    await settle(fixture)

    fixture.nativeElement.querySelector('[data-panel-button="files"]').click()
    fixture.detectChanges()

    expect(fixture.componentInstance.activePanel()).toBe('files')
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()
  })

  it('does not pin terminal tabs before the user adds them', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    fixture.componentInstance.openDetailPanel()
    await settle(fixture)

    expect(fixture.nativeElement.querySelector('[data-panel-button="files"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-panel-button="computer"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-panel-button="terminal"]')).toBeNull()
  })

  it('allows closing the last remaining workspace tab and shows the empty workspace placeholder', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    fixture.componentInstance.openDetailPanel()
    await settle(fixture)

    const onlyTabId = fixture.componentInstance.activeTabId()
    expect(fixture.nativeElement.querySelector(`[data-close-tab="${onlyTabId}"]`)).not.toBeNull()

    fixture.componentInstance.closeWorkspaceTab(new MouseEvent('click'), onlyTabId)
    await settle(fixture)

    expect(fixture.componentInstance.workspaceTabs()).toHaveLength(0)
    expect(fixture.componentInstance.activeTabId()).toBe('')
    expect(fixture.componentInstance.showDetailPanel()).toBe(true)
    expect(fixture.nativeElement.querySelector('[data-empty-workspace-placeholder]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-empty-workspace-card-grid]')?.className).toContain(
      'grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]'
    )
    expect(fixture.nativeElement.querySelector('[data-empty-workspace-card="files"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-empty-workspace-card="browser"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-empty-workspace-card="review"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-empty-workspace-card="terminal"]')).not.toBeNull()
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).toBeNull()
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationPreviewComponent))).toBeNull()
    expect(fixture.debugElement.query(By.directive(ChatSharedTerminalComponent))).toBeNull()
  })

  it('opens workspace tabs from the empty workspace placeholder', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    fixture.componentInstance.openDetailPanel()
    await settle(fixture)

    fixture.componentInstance.closeWorkspaceTab(new MouseEvent('click'), fixture.componentInstance.activeTabId())
    await settle(fixture)
    ;(fixture.nativeElement.querySelector('[data-empty-workspace-card="browser"]') as HTMLElement).click()
    await settle(fixture)

    expect(fixture.componentInstance.activeTab()?.kind).toBe('browser')
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationPreviewComponent))).not.toBeNull()
  })

  it('adds and closes file and terminal tabs on demand', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    const component = fixture.componentInstance as WorkspaceTabTestComponent
    await settle(fixture)

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
    expect(fixture.nativeElement.querySelector(`[data-tab-id="${fileTab.id}"]`)).not.toBeNull()
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

  it('opens the task maintenance panel from the conversation detail header', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    fixture.componentInstance.openDetailPanel()
    await settle(fixture)
    ;(fixture.nativeElement.querySelector('[data-open-tasks-panel]') as HTMLButtonElement).click()
    await settle(fixture)

    const tasksPanel = fixture.debugElement.query(By.directive(ChatTasksComponent))
    expect(fixture.componentInstance.activeTab()?.kind).toBe('tasks')
    expect(fixture.nativeElement.querySelector('[data-panel-button="tasks"]')).not.toBeNull()
    expect(tasksPanel).not.toBeNull()
    expect((tasksPanel.componentInstance as ChatTasksComponent).embedded).toBe(true)
    expect((tasksPanel.componentInstance as ChatTasksComponent).xpertId).toBe('assistant-1')
    ;(tasksPanel.componentInstance as ChatTasksComponent).tasksChanged.emit()
    ;(fixture.nativeElement.querySelector('[data-open-tasks-panel]') as HTMLButtonElement).click()
    await settle(fixture)

    expect(fixture.componentInstance.workspaceTabs().filter((tab) => tab.kind === 'tasks')).toHaveLength(1)
    expect(facade.refreshTaskSummaries).toHaveBeenCalled()
  })

  it('opens task history conversations inside the embedded chatkit', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    fixture.componentInstance.openDetailPanel()
    await settle(fixture)
    ;(fixture.nativeElement.querySelector('[data-open-tasks-panel]') as HTMLButtonElement).click()
    await settle(fixture)

    const tasksPanel = fixture.debugElement.query(By.directive(ChatTasksComponent))
    expect(tasksPanel).not.toBeNull()

    facade.onChatThreadChange.mockClear()
    conversationService.markRead.mockClear()
    ;(tasksPanel.componentInstance as ChatTasksComponent).conversationSelected.emit({
      id: 'history-conversation-1',
      threadId: 'history-thread-1',
      status: 'idle',
      messages: []
    } as IChatConversation)
    await settle(fixture)

    expect(setThreadId).toHaveBeenCalledWith('history-thread-1')
    expect(facade.onChatThreadChange).toHaveBeenCalledWith('history-thread-1')
    expect(facade.setActiveConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'history-conversation-1', threadId: 'history-thread-1' })
    )
    expect(conversationService.markRead).toHaveBeenCalledWith('history-conversation-1')
  })

  it('opens assistant conversation client commands inside the embedded chatkit', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    conversationService.getById.mockReturnValue(
      of({
        id: 'job-conversation-1',
        threadId: 'persisted-thread-1',
        status: 'busy',
        messages: []
      } as IChatConversation)
    )
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    facade.onChatThreadChange.mockClear()
    conversationService.markRead.mockClear()
    const registry = TestBed.inject(ViewClientCommandRegistry)
    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
        conversationId: 'job-conversation-1',
        threadId: 'job-thread-1',
        executionId: 'job-execution-1'
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'drawing-material',
        manifest: buildFixedViewManifest('drawing-material')
      }
    )
    await settle(fixture)

    expect(result).toEqual({
      success: true,
      status: 'opened',
      target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
      conversationId: 'job-conversation-1',
      threadId: 'job-thread-1',
      executionId: 'job-execution-1'
    })
    expect(conversationService.getById).toHaveBeenCalledWith('job-conversation-1', { relations: ['messages'] })
    expect(setThreadId).toHaveBeenCalledWith('job-thread-1')
    expect(facade.onChatThreadChange).toHaveBeenCalledWith('job-thread-1')
    expect(facade.setActiveConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'job-conversation-1', threadId: 'job-thread-1' })
    )
    expect(conversationService.markRead).toHaveBeenCalledWith('job-conversation-1')
  })

  it('restores the embedded ChatKit from pet mode before opening assistant conversation client commands', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    conversationService.getById.mockReturnValue(
      of({
        id: 'job-conversation-1',
        threadId: 'persisted-thread-1',
        status: 'busy',
        messages: []
      } as IChatConversation)
    )
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const chatkit = fixture.nativeElement.querySelector('xpert-chatkit') as HTMLElement | null
    expect(chatkit).not.toBeNull()
    if (!chatkit) {
      throw new Error('Expected xpert-chatkit to render')
    }
    const shadowRoot = chatkit.shadowRoot ?? chatkit.attachShadow({ mode: 'open' })
    const petButton = document.createElement('button')
    const restorePet = jest.fn(() => {
      delete chatkit.dataset.chatMinimizedToPet
    })
    petButton.setAttribute('data-chatkit-host-pet', '')
    petButton.addEventListener('click', restorePet)
    shadowRoot.appendChild(petButton)

    fixture.componentInstance.openDetailPanel()
    fixture.componentInstance.workspaceMaximized.set(true)
    chatkit.dataset.chatMinimizedToPet = 'true'
    await settle(fixture)

    expect(fixture.componentInstance.isChatMinimizedToPet()).toBe(true)
    expect(fixture.componentInstance.chatkitHiddenFromWorkspace()).toBe(true)

    facade.onChatThreadChange.mockClear()
    conversationService.markRead.mockClear()
    const registry = TestBed.inject(ViewClientCommandRegistry)
    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
        conversationId: 'job-conversation-1',
        threadId: 'job-thread-1'
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'drawing-material',
        manifest: buildFixedViewManifest('drawing-material')
      }
    )
    await settle(fixture)

    expect(result).toEqual({
      success: true,
      status: 'opened',
      target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
      conversationId: 'job-conversation-1',
      threadId: 'job-thread-1'
    })
    expect(restorePet).toHaveBeenCalledTimes(1)
    expect(fixture.componentInstance.isChatMinimizedToPet()).toBe(false)
    expect(fixture.componentInstance.workspaceMaximized()).toBe(false)
    expect(fixture.componentInstance.chatkitHiddenFromWorkspace()).toBe(false)
    expect(setThreadId).toHaveBeenCalledWith('job-thread-1')
    expect(facade.onChatThreadChange).toHaveBeenCalledWith('job-thread-1')
    expect(conversationService.markRead).toHaveBeenCalledWith('job-conversation-1')
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

    const component = fixture.componentInstance as WorkspaceTabTestComponent
    component.addWorkspaceTab('terminal')
    await settle(fixture)

    const chatSurface = fixture.nativeElement.querySelector('[data-chatkit-surface]') as HTMLElement | null
    const tabHeader = fixture.nativeElement.querySelector('[data-workspace-tab-header]') as HTMLElement | null
    const tabNav = fixture.nativeElement.querySelector('nav[z-tab-nav-bar]') as HTMLElement | null
    const addTabButton = fixture.nativeElement.querySelector('[data-add-workspace-tab]') as HTMLElement | null
    const tabButton = fixture.nativeElement.querySelector('[data-panel-button="terminal"]') as HTMLElement | null
    const closeButton = fixture.nativeElement.querySelector(
      `[data-close-tab="${component.activeTabId()}"]`
    ) as HTMLElement | null
    const closeButtonIcon = closeButton?.querySelector('span') as HTMLElement | null

    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain(
      'lg:grid-cols-[minmax(0,1fr)_minmax(24rem,var(--clawxpert-chatkit-width))]'
    )
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain(
      'grid-rows-[minmax(0,1fr)_minmax(24rem,32rem)]'
    )
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('lg:grid-rows-1')
    expect(fixture.componentInstance.chatShellClasses()).toContain('lg:max-w-[var(--clawxpert-chatkit-width)]')
    expect(fixture.componentInstance.detailPanelShellClasses()).toContain('opacity-100')
    expect(chatSurface?.className).toContain('border-l')
    expect(tabHeader?.className).toContain('py-1.5')
    expect(tabHeader?.className).toContain('items-center')
    expect(tabHeader?.className).not.toContain('pt-4')
    expect(tabHeader?.className).not.toContain('flex-col')
    expect(tabNav).not.toBeNull()
    expect(tabNav?.className).not.toContain('flex-1')
    expect(tabNav?.className).toContain('min-w-0')
    expect(tabNav?.contains(addTabButton)).toBe(false)
    expect(tabButton?.className).toContain('rounded-lg')
    expect(tabButton?.className).toContain('bg-hover-bg')
    expect(tabButton?.className).toContain('data-[active=true]:!border-transparent')
    expect(tabButton?.className).toContain('data-[active=true]:!bg-hover-bg')
    expect(closeButton?.className).toContain('opacity-0')
    expect(closeButton?.className).toContain('group-hover/tab:opacity-100')
    expect(closeButtonIcon?.className).toContain('rounded-full')
    expect(tabButton?.className).toContain('h-9')
    expect(tabButton?.className).toContain('text-sm')
    expect(addTabButton?.className).toContain('!h-9')
    expect(addTabButton?.className).toContain('!w-9')
    expect(addTabButton?.className).toContain('rounded-xl')
  })

  it('maximizes the workspace by hiding ChatKit and restores it from the header button', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.openDetailPanel()
    await settle(fixture)

    const maximizeButton = fixture.nativeElement.querySelector(
      '[data-toggle-workspace-maximized]'
    ) as HTMLButtonElement | null
    const resizeHandle = fixture.nativeElement.querySelector('[data-chatkit-resize-handle]') as HTMLElement | null

    expect(maximizeButton).not.toBeNull()
    expect(resizeHandle).not.toBeNull()
    expect(fixture.componentInstance.workspaceMaximized()).toBe(false)

    maximizeButton?.click()
    await settle(fixture)

    expect(fixture.componentInstance.workspaceMaximized()).toBe(true)
    expect(fixture.componentInstance.chatkitHiddenFromWorkspace()).toBe(true)
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('lg:grid-cols-[minmax(0,1fr)_0rem]')
    expect(fixture.componentInstance.chatShellClasses()).toContain('pointer-events-none')
    expect(fixture.componentInstance.chatShellClasses()).toContain('lg:w-0')
    expect(fixture.nativeElement.querySelector('[data-chatkit-resize-handle]')).toBeNull()

    maximizeButton?.click()
    await settle(fixture)

    expect(fixture.componentInstance.workspaceMaximized()).toBe(false)
    expect(fixture.componentInstance.chatkitHiddenFromWorkspace()).toBe(false)
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain(
      'lg:grid-cols-[minmax(0,1fr)_minmax(24rem,var(--clawxpert-chatkit-width))]'
    )
    expect(fixture.nativeElement.querySelector('[data-chatkit-resize-handle]')).not.toBeNull()
  })

  it('resizes the ChatKit panel from its left edge and clamps the width', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    fixture.componentInstance.openDetailPanel()
    await settle(fixture)

    const handle = fixture.nativeElement.querySelector('[data-chatkit-resize-handle]') as HTMLElement | null
    expect(handle).not.toBeNull()
    expect(fixture.componentInstance.chatkitWidthPx()).toBe(512)
    expect(fixture.componentInstance.chatShellClasses()).not.toContain('transition-[width')

    handle?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 800 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 700 }))
    await settle(fixture)

    expect(fixture.componentInstance.isResizingChatkit()).toBe(true)
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('transition-none')
    expect(fixture.componentInstance.workspaceLayoutClasses()).not.toContain('transition-[grid-template-columns')
    expect(fixture.componentInstance.chatkitWidthPx()).toBe(612)
    expect(fixture.componentInstance.chatkitWidthStyle()).toBe('612px')

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: -1000 }))
    await settle(fixture)
    expect(fixture.componentInstance.chatkitWidthPx()).toBe(960)

    window.dispatchEvent(new MouseEvent('pointerup'))
    await settle(fixture)
    expect(fixture.componentInstance.isResizingChatkit()).toBe(false)

    fixture.componentInstance.resizeChatkitFromKeyboard(new KeyboardEvent('keydown'), -1000)
    expect(fixture.componentInstance.chatkitWidthPx()).toBe(384)
  })

  it('opens the workspace panel and hides its close button when ChatKit minimizes into the pet overlay', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const chatkit = fixture.nativeElement.querySelector('xpert-chatkit') as HTMLElement | null
    const showDetailPanelButton = fixture.nativeElement.querySelector(
      '[data-toggle-detail-panel]'
    ) as HTMLElement | null
    expect(chatkit).not.toBeNull()
    if (!chatkit) {
      throw new Error('Expected xpert-chatkit to render')
    }
    const shadowRoot = chatkit.shadowRoot ?? chatkit.attachShadow({ mode: 'open' })
    const petButton = document.createElement('button')
    const activatePet = jest.fn(() => {
      delete chatkit.dataset.chatMinimizedToPet
    })
    petButton.setAttribute('data-chatkit-host-pet', '')
    petButton.addEventListener('click', activatePet)
    shadowRoot.appendChild(petButton)

    expect(showDetailPanelButton).not.toBeNull()
    expect(fixture.componentInstance.isChatMinimizedToPet()).toBe(false)
    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('lg:grid-cols-[0rem_minmax(0,1fr)]')
    expect(fixture.componentInstance.chatShellClasses()).toContain('lg:w-full')
    expect(fixture.componentInstance.chatSurfaceClasses()).toBe('')

    chatkit.dataset.chatMinimizedToPet = 'true'
    await settle(fixture)

    expect(fixture.componentInstance.isChatMinimizedToPet()).toBe(true)
    expect(fixture.componentInstance.showDetailPanel()).toBe(true)
    expect(fixture.componentInstance.workbenchMaximized()).toBe(true)
    expect(fixture.componentInstance.chatkitHiddenFromWorkspace()).toBe(true)
    expect(fixture.nativeElement.querySelector('[data-toggle-detail-panel]')).toBeNull()
    const petMaximizeButton = fixture.nativeElement.querySelector(
      '[data-toggle-workspace-maximized]'
    ) as HTMLElement | null
    const petMaximizeButtonIcon = petMaximizeButton?.querySelector('i') as HTMLElement | null
    expect(petMaximizeButton).not.toBeNull()
    expect(petMaximizeButton?.className).toContain('bg-hover-bg')
    expect(petMaximizeButtonIcon?.className).toContain('ri-fullscreen-exit-line')
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('lg:grid-cols-[minmax(0,1fr)_0rem]')
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain('grid-rows-[minmax(0,1fr)_0rem]')
    expect(fixture.componentInstance.chatShellClasses()).toContain('lg:w-0')
    expect(fixture.componentInstance.chatShellClasses()).toContain('lg:max-w-0')
    expect(fixture.componentInstance.chatSurfaceClasses()).toBe('')

    petMaximizeButton?.click()
    await settle(fixture)

    expect(activatePet).toHaveBeenCalledTimes(1)
    expect(fixture.componentInstance.isChatMinimizedToPet()).toBe(false)
    expect(fixture.componentInstance.showDetailPanel()).toBe(true)
    expect(fixture.componentInstance.workbenchMaximized()).toBe(false)
    expect(fixture.componentInstance.chatkitHiddenFromWorkspace()).toBe(false)
    expect(fixture.nativeElement.querySelector('[data-toggle-detail-panel]')).not.toBeNull()
    expect(fixture.componentInstance.workspaceLayoutClasses()).toContain(
      'lg:grid-cols-[minmax(0,1fr)_minmax(24rem,var(--clawxpert-chatkit-width))]'
    )
    expect(fixture.componentInstance.chatShellClasses()).toContain('lg:max-w-[var(--clawxpert-chatkit-width)]')
    expect(fixture.componentInstance.chatSurfaceClasses()).toContain('border-l')
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
    fixture.componentInstance.openDetailPanel()
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
    fixture.componentInstance.openDetailPanel()
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
    conversationService.markRead.mockClear()

    runtimeInput.onResponseStart?.()
    runtimeInput.onResponseEnd?.()
    await settle(fixture)

    expect(facade.patchActiveConversationStatus).toHaveBeenNthCalledWith(1, 'busy')
    expect(facade.patchActiveConversationStatus).toHaveBeenNthCalledWith(2, 'idle')
    expect(conversationService.markRead).toHaveBeenCalledWith('conversation-1')
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
    fixture.componentInstance.openDetailPanel()
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
    fixture.componentInstance.openDetailPanel()
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
    fixture.componentInstance.openDetailPanel()
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
    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()

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

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(fixture.componentInstance.showDetailPanel()).toBe(true)
    expect(filesPanel).not.toBeNull()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(0)

    jest.advanceTimersByTime(299)
    fixture.detectChanges()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(0)

    jest.advanceTimersByTime(1)
    fixture.detectChanges()
    expect((filesPanel.componentInstance as ClawXpertConversationFilesComponent).reloadKey).toBe(1)
  })

  it('publishes assistant tool completed host events from ChatKit tool-end logs', async () => {
    const publish = jest.spyOn(hostEvents, 'publish')
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const runtimeInput = getRuntimeInput()
    runtimeInput.onLog?.({
      name: 'lg.tool.end',
      data: {
        toolName: 'excalidraw_patch_scene',
        toolCallId: 'call-1',
        argsPreview: '{"targetId":"target-1","updates":[{"id":"title","patch":{"text":"Observability"}}]}',
        durationMs: 73
      }
    })

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistant.tool.completed',
        source: 'chatkit',
        receivedAt: expect.any(String),
        hostType: 'agent',
        hostId: 'assistant-1',
        threadId: 'thread-1',
        toolName: 'excalidraw_patch_scene',
        toolCallId: 'call-1',
        durationMs: 73,
        data: expect.objectContaining({
          toolName: 'excalidraw_patch_scene',
          argsPreview: expect.any(String)
        })
      })
    )
  })

  it('opens a browser tab when a sandbox service start tool log arrives', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
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
    expect(fixture.componentInstance.showDetailPanel()).toBe(true)
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
    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()

    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        detail: {
          tool: 'sandbox_write_file'
        }
      }
    })
    jest.advanceTimersByTime(200)
    fixture.detectChanges()

    const filesPanel = fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))
    expect(fixture.componentInstance.showDetailPanel()).toBe(true)
    expect(filesPanel).not.toBeNull()

    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        detail: {
          tool: 'sandbox_append_file'
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
    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()

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
    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()
  })

  it('ignores legacy Bash execute log events for file list refresh', async () => {
    jest.useFakeTimers()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settleWithFakeTimers(fixture)

    const runtimeInput = getRuntimeInput()
    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()

    runtimeInput.onLog?.({
      name: 'tool_log',
      data: {
        message: {
          toolset: 'Bash',
          tool: 'execute'
        }
      }
    })
    fixture.detectChanges()

    jest.advanceTimersByTime(300)
    fixture.detectChanges()
    expect(fixture.componentInstance.showDetailPanel()).toBe(false)
    expect(fixture.debugElement.query(By.directive(ClawXpertConversationFilesComponent))).not.toBeNull()
  })
})
