import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { CreateChatKitOptions } from '@xpert-ai/chatkit-angular'
import {
  XpertWorkbenchInitialLayoutEnum,
  type IconDefinition,
  type TXpertProjectAccessSummary,
  type XpertExtensionViewManifest,
  type XpertViewQuery
} from '@xpert-ai/contracts'
import { BehaviorSubject, of } from 'rxjs'
import {
  AiThreadService,
  ArtifactService,
  ChatConversationService,
  GroupWorkbenchApiService,
  IChatConversation,
  Store,
  ViewExtensionApiService
} from '../../../@core'
import { ViewHostEventBus } from '../../../@shared/view-extension/view-host-event-bus.service'
import { XpertProjectApiService } from '../../project/project-api.service'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import { ClawXpertSkillTrialIntentService } from './clawxpert-skill-trial-intent.service'
import {
  getClawXpertChatkitPetStorageKey,
  getClawXpertWorkbenchLayoutStorageKey
} from './clawxpert-workbench-layout-storage.service'
import { ClawXpertWorkbenchViewUrlState } from './clawxpert-workbench-view-url-state.service'
import { ClawXpertFacade } from './clawxpert.facade'
jest.mock('../../assistant/workspace-connector-client-command', () => ({
  injectWorkspaceConnectorClientCommand: jest.fn()
}))

jest.mock('../../../@core', () => ({
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  AiThreadService: class AiThreadService {},
  ArtifactService: class ArtifactService {},
  ChatConversationService: jest.requireActual('../../../@core/services/chat-conversation.service')
    .ChatConversationService,
  ViewExtensionApiService: class ViewExtensionApiService {},
  Store: class Store {},
  GroupWorkbenchApiService: class GroupWorkbenchApiService {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : ''),
  injectToastr: () => ({
    warning: jest.fn(),
    danger: jest.fn(),
    error: jest.fn()
  })
}))

jest.mock('../../assistant/workbench-file-preview-dialog.component', () => ({
  openWorkbenchFilePreviewDialog: jest.fn(() => ({
    closed: new (jest.requireActual('rxjs').Subject)(),
    close: jest.fn()
  }))
}))

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

jest.mock('./clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

const TEST_LAYOUT_ICON = {
  type: 'font',
  value: 'ri-layout-grid-line',
  alt: 'Layout'
} satisfies IconDefinition

const WORKBENCH_LAYOUT_TEST_ASSISTANT_IDS = ['assistant-1', 'assistant-2']

const WORKBENCH_LAYOUT_TEST_USER_IDS = ['user-1', 'user-2']

function clearWorkbenchLayoutTestStorage() {
  WORKBENCH_LAYOUT_TEST_USER_IDS.forEach((userId) => {
    WORKBENCH_LAYOUT_TEST_ASSISTANT_IDS.forEach((assistantId) => {
      localStorage.removeItem(getClawXpertWorkbenchLayoutStorageKey(userId, assistantId))
      localStorage.removeItem(getClawXpertChatkitPetStorageKey(userId, assistantId))
    })
  })
}

jest.mock('../../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    injectHostedAssistantChatkitControl: jest.fn(() =>
      signal({
        element: null,
        setOptions: jest.fn(),
        setThreadId: jest.fn(async () => {}),
        setComposerValue: jest.fn(async () => {}),
        focusComposer: jest.fn(async () => {}),
        sendUserMessage: jest.fn(async () => {})
      })
    )
  }
})

const runtimeModule = jest.requireMock('../../assistant/assistant-chatkit.runtime') as {
  injectHostedAssistantChatkitControl: jest.Mock
}

jest.mock('../workbench-chat/frequent-questions-start-screen', () => {
  const { signal } = jest.requireActual('@angular/core')
  return { injectFrequentQuestionsStartScreen: jest.fn(() => signal(null)) }
})

const frequentQuestionsModule = jest.requireMock('../workbench-chat/frequent-questions-start-screen') as {
  injectFrequentQuestionsStartScreen: jest.Mock
}

const filePreviewModule = jest.requireMock('../../assistant/workbench-file-preview-dialog.component') as {
  openWorkbenchFilePreviewDialog: jest.Mock
}

type MockChatKitEvent = {
  name: string
  data?: object
}

type MockChatKitRuntimeInput = {
  delegatedConversation?: () => { conversationId: string; requesterXpertId: string } | null
  assistantId?: () => string | null
  displayMode?: CreateChatKitOptions['displayMode']
  header?: () => CreateChatKitOptions['header']
  initialThread?: () => string | null
  startScreen?: () => CreateChatKitOptions['startScreen'] | null
  projectId?: () => string | null
  composer?: () => { projects?: { enabled?: boolean; createEnabled?: boolean; autoNewEnabled?: boolean } }
  layout?: CreateChatKitOptions['layout']
  taskSummary?: CreateChatKitOptions['taskSummary']
  workbench?: () => CreateChatKitOptions['workbench']
  requestContext?: () => Record<string, unknown> | null
  onThreadChange?: (event: { threadId: string | null }) => void
  onProjectChange?: (event: {
    projectId: string | null
    selection?: import('@xpert-ai/contracts').ProjectSelection
  }) => void
  onThreadLoadStart?: (event: { threadId: string | null }) => void
  onThreadLoadEnd?: (event: { threadId: string | null }) => void
  onEffect?: (event: MockChatKitEvent) => void
  onLog?: (event: MockChatKitEvent) => void
  onResponseStart?: () => void
  onResponseEnd?: () => void
}

async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    fixture.detectChanges()
    await fixture.whenStable()
    await Promise.resolve()
  }
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
    slot: 'agent.workbench',
    order: 50,
    source: {
      provider: 'test-provider'
    },
    workbench: {
      openMode: 'auto',
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
jest.mock('./conversation-detail/chatkit/task-resource-dialog.component', () => ({
  openChatkitTaskResourceDialog: jest.fn(() => ({
    closed: new (jest.requireActual('rxjs').Subject)(),
    close: jest.fn()
  }))
}))
export const resourceDialogModule = jest.requireMock(
  './conversation-detail/chatkit/task-resource-dialog.component'
) as { openChatkitTaskResourceDialog: jest.Mock }

jest.mock('@xpert-ai/headless-ui', () => {
  const { Component, Input } = jest.requireActual('@angular/core')
  @Component({ standalone: true, selector: 'z-icon', template: '' })
  class ZardIconComponent {
    @Input() zType?: string
  }
  return { ZardIconComponent }
})

export function configureConversationDetailTests() {
  let facade: {
    definition: { titleKey: string; defaultTitle: string }
    identity: ReturnType<typeof signal<string | null>>
    userId: ReturnType<typeof signal<string | null>>
    assistantId: ReturnType<typeof signal<string | null>>
    loading: ReturnType<typeof signal<boolean>>
    loadingUserPreference: ReturnType<typeof signal<boolean>>
    viewState: ReturnType<typeof signal<'ready' | 'wizard' | 'error' | 'organization-required'>>
    resolvedPreference: ReturnType<typeof signal<{ assistantId: string } | null>>
    xpertId: ReturnType<typeof signal<string | null>>
    group: ReturnType<typeof signal<{ id: string } | null>>
    initialLayout: ReturnType<typeof signal<XpertWorkbenchInitialLayoutEnum | null>>
    defaultViewKey: ReturnType<typeof signal<string | null>>
    currentWorkspaceId: ReturnType<typeof signal<string | null>>
    projectId: ReturnType<typeof signal<string | null>>
    projectAccess: ReturnType<typeof signal<TXpertProjectAccessSummary | null>>
    chatkitFrameUrl: ReturnType<typeof signal<string | null>>
    threadId: ReturnType<typeof signal<string | null>>
    suppressAutoResume: ReturnType<typeof signal<boolean>>
    pendingConversationStartId: ReturnType<typeof signal<number>>
    activeConversation: ReturnType<typeof signal<IChatConversation | null>>
    onChatThreadChange: jest.Mock
    onChatProjectChange: jest.Mock
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
    resolveWorkbenchNavigation: jest.Mock
    markRead: jest.Mock
    getFile: jest.Mock
    downloadFile: jest.Mock
  }
  let artifactService: {
    createSignedPreviewLink: jest.Mock
  }
  let viewExtensionApi: {
    getSlotViews: jest.Mock
  }
  let groupWorkbenchApi: { getContext: jest.Mock }
  let skillTrialIntent: {
    peek: jest.Mock
    consume: jest.Mock
    set: jest.Mock
    clear: jest.Mock
  }
  let workbenchViewUrlState: {
    viewClosed: ReturnType<typeof signal<boolean>>
    projectId: ReturnType<typeof signal<string | null>>
    viewKey: ReturnType<typeof signal<string | null>>
    viewLayout: ReturnType<typeof signal<'split' | 'maximized' | null>>
    viewQuery: ReturnType<typeof signal<XpertViewQuery | null>>
    setViewKey: jest.Mock
    setViewState: jest.Mock
  }
  let hostEvents: ViewHostEventBus
  let projectApi: { availableForXpert: jest.Mock; create: jest.Mock }
  let projectPermissions: { userRolePermissions$: BehaviorSubject<[]>; hasPermission: jest.Mock }
  beforeEach(async () => {
    clearWorkbenchLayoutTestStorage()
    projectPermissions = { userRolePermissions$: new BehaviorSubject<[]>([]), hasPermission: jest.fn(() => true) }
    skillTrialIntent = {
      peek: jest.fn(() => null),
      consume: jest.fn(() => null),
      set: jest.fn(),
      clear: jest.fn()
    }
    const viewProjectId = signal<string | null>(null)
    const viewKey = signal<string | null>(null)
    const viewQuery = signal<XpertViewQuery | null>(null)
    workbenchViewUrlState = {
      viewClosed: signal(false),
      projectId: viewProjectId,
      viewKey,
      viewLayout: signal<'split' | 'maximized' | null>(null),
      viewQuery,
      setViewKey: jest.fn((nextViewKey: string | null) => {
        viewProjectId.set(null)
        viewKey.set(nextViewKey)
        if (!nextViewKey) viewQuery.set(null)
        return Promise.resolve(true)
      }),
      setViewState: jest.fn(
        (nextViewKey: string | null, nextViewQuery: XpertViewQuery | null, options?: { projectId?: string }) => {
          viewProjectId.set(options?.projectId ?? null)
          viewKey.set(nextViewKey)
          viewQuery.set(nextViewKey ? nextViewQuery : null)
          return Promise.resolve(true)
        }
      )
    }
    const activeConversation = signal<IChatConversation | null>(null)
    facade = {
      definition: {
        titleKey: 'XP.Chat.ClawXpert.DetailTitle',
        defaultTitle: 'ClawXpert'
      },
      identity: signal('clawxpert'),
      userId: signal('user-1'),
      assistantId: signal('assistant-1'),
      loading: signal(false),
      loadingUserPreference: signal(false),
      viewState: signal('ready'),
      resolvedPreference: signal({ assistantId: 'assistant-1' }),
      xpertId: signal('assistant-1'),
      group: signal<{ id: string } | null>(null),
      initialLayout: signal<XpertWorkbenchInitialLayoutEnum | null>(XpertWorkbenchInitialLayoutEnum.TwoColumns),
      defaultViewKey: signal(null),
      currentWorkspaceId: signal('workspace-1'),
      projectId: signal<string | null>(null),
      projectAccess: signal<TXpertProjectAccessSummary | null>(null),
      chatkitFrameUrl: signal('https://frame.example.com'),
      threadId: signal('thread-1'),
      suppressAutoResume: signal(false),
      pendingConversationStartId: signal(0),
      activeConversation,
      onChatThreadChange: jest.fn(),
      onChatProjectChange: jest.fn(),
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
      resolveWorkbenchNavigation: jest.fn(() =>
        of({
          conversationId: 'conversation-1',
          threadId: 'thread-1',
          xpertId: 'assistant-1',
          projectId: null,
          isExternalAssistant: false
        })
      ),
      markRead: jest.fn(() => of({})),
      getFile: jest.fn(() =>
        of({
          filePath: '/workspace/report.pdf',
          fileUrl: 'https://files.example.com/report.pdf',
          mimeType: 'application/pdf',
          size: 2 * 1024 * 1024
        })
      ),
      downloadFile: jest.fn(() => of(new Blob(['private report'], { type: 'application/pdf' })))
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
    groupWorkbenchApi = { getContext: jest.fn() }
    projectApi = {
      availableForXpert: jest.fn(() => of({ items: [], total: 0 })),
      create: jest.fn(() => of({ id: 'project-created', name: 'Launch project' }))
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertConversationDetailComponent],
      providers: [
        provideRouter([]),
        { provide: Store, useValue: projectPermissions },
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
          provide: GroupWorkbenchApiService,
          useValue: groupWorkbenchApi
        },
        {
          provide: XpertProjectApiService,
          useValue: projectApi
        },
        {
          provide: ClawXpertSkillTrialIntentService,
          useValue: skillTrialIntent
        },
        {
          provide: ClawXpertWorkbenchViewUrlState,
          useValue: workbenchViewUrlState
        }
      ]
    }).compileComponents()

    hostEvents = TestBed.inject(ViewHostEventBus)
  })
  afterEach(() => {
    jest.useRealTimers()
    TestBed.resetTestingModule()
    clearWorkbenchLayoutTestStorage()
    jest.clearAllMocks()
  })
  return () => ({
    facade,
    aiThreadService,
    conversationService,
    artifactService,
    viewExtensionApi,
    groupWorkbenchApi,
    skillTrialIntent,
    workbenchViewUrlState,
    hostEvents,
    projectApi,
    projectPermissions
  })
}
export {
  buildFixedViewManifest,
  filePreviewModule,
  frequentQuestionsModule,
  getRuntimeInput,
  runtimeModule,
  settle,
  TEST_LAYOUT_ICON
}
