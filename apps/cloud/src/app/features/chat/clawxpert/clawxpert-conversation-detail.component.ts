import { openWorkbenchProject } from './workbench-project-navigation'
import { FileDocumentStore } from '../../../@shared/files/document/file-document-store'
import { registerAssistantComposerAppendReferencesCommand } from '../../assistant/assistant-composer-client-command'
import { CommonModule } from '@angular/common'
import { Dialog } from '@angular/cdk/dialog'
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  untracked,
  viewChild,
  viewChildren
} from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatKit, type ChatKitControl, type CreateChatKitOptions } from '@xpert-ai/chatkit-angular'
import type { ChatKitReference } from '@xpert-ai/chatkit-types'
import type {
  WorkbenchOpenFile,
  TChatElementReference,
  XpertExtensionViewManifest,
  XpertViewQuery,
  XpertViewHostEventMessage,
  XpertViewRuntimeScopeInput
} from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardMenuImports,
  ZardTabsImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import type { FileWorkbenchReferenceRequest } from '../../../@shared/files'
import { EmojiAvatarComponent, IconComponent } from '../../../@shared/avatar'
import { ChatSharedTerminalComponent } from '../../../@shared/chat/terminal/terminal.component'
import { ViewHostEventBus } from '../../../@shared/view-extension/view-host-event-bus.service'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import {
  AiThreadService,
  ArtifactService,
  ChatConversationService,
  IChatConversation,
  ViewExtensionApiService,
  getErrorMessage,
  injectToastr
} from '../../../@core'
import {
  registerAssistantChatSendMessageCommand,
  registerAssistantContextSetCommand
} from '../../assistant/assistant-chat-client-command'
import { injectHostedAssistantChatkitControl } from '../../assistant/assistant-chatkit.runtime'
import { createKnowledgebaseCitationOpenHostEvent } from '../../assistant/knowledgebase-citation-effect'
import { registerWorkbenchFileOpenCommand } from '../../assistant/workbench-file-open-client-command'
import {
  registerWorkbenchNavigationOpenCommand,
  type WorkbenchAssistantConversationOpenRequest,
  type WorkbenchExtensionViewOpenRequest
} from '../../assistant/workbench-navigation-open-client-command'
import { openWorkbenchFilePreviewDialog } from '../../assistant/workbench-file-preview-dialog.component'
import { WorkbenchPresentationService } from '../../../@core/services/workbench-presentation.service'
import { WorkbenchAssistantMenuComponent } from '../workbench-chat/workbench-assistant-menu.component'
import { WorkbenchAccountComponent } from '../workbench-chat/workbench-account.component'
import { WORKBENCH_CHAT_FACADE, WorkbenchChatFacade } from '../workbench-chat/workbench-chat.facade'
import { injectFrequentQuestionsStartScreen } from '../workbench-chat/frequent-questions-start-screen'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'
import { ClawXpertConversationPreviewComponent } from './clawxpert-conversation-preview.component'
import {
  ClawXpertSkillTrialIntentService,
  type ClawXpertSkillTrialIntent
} from './clawxpert-skill-trial-intent.service'
import {
  ClawXpertWorkbenchLayoutStorage,
  type ClawXpertWorkbenchLayoutState
} from './clawxpert-workbench-layout-storage.service'
import { ClawXpertWorkbenchViewUrlState } from './clawxpert-workbench-view-url-state.service'
import { ClawXpertFacade } from './clawxpert.facade'
import { ChatTasksComponent } from '../tasks/tasks.component'
import {
  type ClawXpertSandboxPreviewTarget,
  getSandboxPreviewTargetFromEffectEvent,
  getSandboxPreviewTargetFromLogEvent
} from './clawxpert-sandbox-preview.utils'
import {
  shouldRefreshWorkspaceFilesFromEffectEvent,
  shouldRefreshWorkspaceFilesFromLogEvent
} from './clawxpert-workspace-file-refresh.utils'
import { createAssistantToolCompletedHostEvent } from './assistant-tool-host-events.utils'
import {
  getTaskSummaryResourceTarget,
  type ClawXpertTaskSummaryResourceTarget
} from './clawxpert-task-summary-effect.utils'
import { ClawXpertFixedViewStackComponent, type ClawXpertFixedViewTab } from './clawxpert-fixed-view-stack.component'
import { XpertProjectApiService } from '../../project/project-api.service'
import { WorkbenchArtifactPanelComponent } from './workbench-artifact-panel.component'
import {
  fileTabsFromToolEvent,
  createFileArtifactTab,
  attachWorkspaceFile,
  generatedConversationOutputs,
  generatedOutputKey,
  releaseArtifactTab,
  sameArtifact,
  updateArtifactTab,
  type WorkbenchArtifactTab
} from './workbench-artifact-tabs'
import {
  CHAT_MINIMIZED_TO_PET_ATTRIBUTE,
  CHATKIT_DISPLAY_MODE_ATTRIBUTE,
  CHATKIT_OPEN_ATTRIBUTE,
  CLAWXPERT_CHATKIT_MIN_WIDTH_PX,
  CLAWXPERT_CHATKIT_DEFAULT_WIDTH_PX,
  CLAWXPERT_CHATKIT_MAX_WIDTH_PX,
  CLAWXPERT_CHAT_COLUMN_MAX_WIDTH,
  WORKSPACE_LAYOUT_TRANSITION_CLASSES,
  CHAT_SHELL_TRANSITION_CLASSES,
  DETAIL_PANEL_SHELL_TRANSITION_CLASSES,
  DETAIL_PANEL_CONTENT_TRANSITION_CLASSES,
  clampChatkitWidth,
  toConfiguredWorkbenchLayoutState,
  resolveEmbeddedChatkitElement,
  isChatkitVisuallyMinimizedToPet
} from './conversation-detail/chatkit/layout'
import { installChatkitOverlayDialogControls } from './conversation-detail/chatkit/overlay-controls'
import {
  CONVERSATION_DETAIL_RELATIONS,
  type WorkbenchConversationChatkitScope,
  getChatProjectCreateName,
  resolveConversationId,
  assertWorkbenchConversationHint,
  hasTaskSummaryRefresh,
  getOptionalSignalValue,
  setWritableSignalValue,
  normalizeConversationThreadId
} from './conversation-detail/chatkit/conversation'
import {
  type AssistantWorkbenchRequestContext,
  buildAssistantRequestContext,
  normalizeAssistantWorkbenchContext
} from './conversation-detail/composer/request-context'
import {
  toFileElementQuoteReference,
  toFilePathQuoteReference,
  toPageElementQuoteReference,
  isFileElementReferenceRequest,
  isFilePathReferenceRequest
} from './conversation-detail/composer/references'
import { toSkillTrialRuntimeCapabilities, readNonEmptyString } from './conversation-detail/composer/skill-trial'
import {
  type ClawXpertStaticTabId,
  type ClawXpertAddableWorkspaceTabKind,
  type ClawXpertWorkspaceTabKind,
  type ClawXpertToolTab,
  type ClawXpertWorkspaceTab,
  type ClawXpertConversationPanel,
  TASKS_WORKSPACE_TAB_ID
} from './conversation-detail/workspace/tabs'
import {
  type ClawXpertBrowserTab,
  type ClawXpertBrowserTabChange,
  DEFAULT_BROWSER_ZOOM,
  WORKBENCH_BROWSER_OPEN_COMMAND,
  isMatchingBrowserTab,
  toWorkbenchBrowserPreviewTarget,
  readHttpUrl
} from './conversation-detail/workspace/browser'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  DEFAULT_FIXED_VIEW_ICON,
  type ClawXpertFixedViewMenuItem,
  shouldShowFixedViewInMenu,
  findFixedViewTab,
  findResolvedViewByKey,
  resolveI18nText,
  equalViewQuery
} from './conversation-detail/workspace/fixed-views'
import {
  KNOWLEDGEBASE_WORKBENCH_VIEW_KEY,
  type KnowledgebaseCitationTarget,
  getKnowledgebaseCitationTarget
} from './conversation-detail/citations/knowledgebase'

const WORKSPACE_FILE_REFRESH_DEBOUNCE_MS = 300

@Component({
  standalone: true,
  selector: 'xp-clawxpert-conversation-detail',
  imports: [
    CommonModule,
    RouterLink,
    WorkbenchAccountComponent,
    WorkbenchAssistantMenuComponent,
    TranslateModule,
    ChatKit,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardMenuImports,
    ...ZardTabsImports,
    ...ZardTooltipImports,
    ClawXpertConversationFilesComponent,
    ClawXpertConversationPreviewComponent,
    ChatTasksComponent,
    ChatSharedTerminalComponent,
    IconComponent,
    EmojiAvatarComponent,
    ClawXpertFixedViewStackComponent,
    WorkbenchArtifactPanelComponent
  ],
  providers: [FileDocumentStore],
  templateUrl: './clawxpert-conversation-detail.component.html',
  styleUrl: './clawxpert-conversation-detail.component.css'
})
export class ClawXpertConversationDetailComponent implements OnDestroy {
  #generatedOutputKeys = new Set<string>()
  #generatedOutputThreadId: string | null = null
  #generatedOutputRequest = 0
  #artifactScopeHostId: string | null = null
  #artifactScopeProjectId: string | null = null
  #destroyed = false
  readonly #presentation = inject(WorkbenchPresentationService)
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef)
  readonly #threadService = inject(AiThreadService)
  readonly #artifactService = inject(ArtifactService)
  readonly #conversationService = inject(ChatConversationService)
  readonly #viewExtensionApi = inject(ViewExtensionApiService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #clientCommands = inject(ViewClientCommandRegistry)
  readonly #hostEvents = inject(ViewHostEventBus)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #skillTrialIntent = inject(ClawXpertSkillTrialIntentService)
  readonly #workbenchLayoutStorage = inject(ClawXpertWorkbenchLayoutStorage)
  readonly #workbenchViewUrlState = inject(ClawXpertWorkbenchViewUrlState)
  readonly #projectApi = inject(XpertProjectApiService)
  readonly #responseActive = signal(false)
  #unregisterComposerCommand: (() => void) | null = null
  #unregisterAssistantCommand: (() => void) | null = null
  #unregisterAssistantContextCommand: (() => void) | null = null
  #unregisterBrowserOpenCommand: (() => void) | null = null
  #unregisterFileOpenCommand: (() => void) | null = null
  #unregisterNavigationOpenCommand: (() => void) | null = null
  #workspaceFileRefreshTimer: ReturnType<typeof setTimeout> | null = null
  #fixedViewsLoadVersion = 0
  #fixedViewsHostId: string | null = null
  #fixedViewsScopeKey: string | null = null
  #assistantWorkbenchContextScopeKey: string | null = null
  #markReadRequestVersion = 0
  #chatkitResizeCleanup: (() => void) | null = null
  #overlayDialogControlsCleanup: (() => void) | null = null
  #activeWorkbenchLayoutPreferenceKey: string | null = null
  #initializedWorkbenchLayoutPreferenceKey: string | null = null
  #pendingWorkbenchLayoutRestore: { preferenceKey: string; state: ClawXpertWorkbenchLayoutState } | null = null
  #pendingChatkitPetRestore: { preferenceKey: string; minimized: boolean } | null = null
  #pendingInitialOverlayOpen = false
  #lastNonFixedTabId: string | null = null
  #activeChatkitControl: ChatKitControl | null = null
  #lastSyncedRoutedThreadId: string | null = null
  #chatkitOriginThreadId: string | null = null
  readonly #workbenchConversationScope = signal<WorkbenchConversationChatkitScope | null>(null)
  #chatkitThreadSync = Promise.resolve()
  #projectCreatePending = false

  readonly #providedFacade = inject(WORKBENCH_CHAT_FACADE, { optional: true })
  readonly facade: WorkbenchChatFacade = this.#providedFacade ?? inject(ClawXpertFacade)
  readonly overlayDialog = signal(false)
  readonly chatkitPinnedToRight = signal(false)
  readonly chatkitDisplayMode = computed<CreateChatKitOptions['displayMode']>(() =>
    this.overlayDialog() ? 'pet' : 'chat'
  )
  readonly projectId = computed(() => getOptionalSignalValue(this.facade, 'projectId'))
  readonly projectAccess = computed(() => this.facade.projectAccess?.() ?? null)
  readonly runtimeProjectId = computed(() =>
    this.facade.projectId ? this.projectId() : (this.resolvedConversation()?.projectId ?? null)
  )
  readonly #projectSelectionEnabled = computed(
    () =>
      !this.#workbenchConversationScope() &&
      Boolean(this.facade.assistantId()?.trim()) &&
      !this.facade.threadId()?.trim()
  )
  readonly #hostChatRouteKey = computed(() =>
    JSON.stringify([this.facade.assistantId()?.trim() || null, this.projectId(), this.facade.threadId()])
  )
  readonly #assistantWorkbenchContexts = signal<Record<string, AssistantWorkbenchRequestContext>>({})
  readonly assistantRequestContext = computed(() =>
    buildAssistantRequestContext({
      workspaceId: getOptionalSignalValue(this.facade, 'currentWorkspaceId'),
      xpertId: this.#workbenchConversationScope()?.xpertId ?? this.facade.xpertId(),
      contexts: this.#assistantWorkbenchContexts()
    })
  )
  readonly chatkitAssistantId = computed(() => this.#workbenchConversationScope()?.xpertId ?? this.facade.assistantId())
  readonly chatkitProjectId = computed(() => {
    const scope = this.#workbenchConversationScope()
    return scope ? scope.projectId : this.projectId()
  })
  readonly chatkitInitialThread = computed(() => this.#workbenchConversationScope()?.threadId ?? this.facade.threadId())
  readonly chatkitDelegatedConversation = computed(() => {
    const scope = this.#workbenchConversationScope()
    return scope
      ? {
          conversationId: scope.conversationId,
          requesterXpertId: scope.requesterXpertId
        }
      : null
  })
  readonly chatkitMountKey = computed(() => {
    const delegatedConversation = this.chatkitDelegatedConversation()
    return JSON.stringify([
      this.chatkitAssistantId(),
      this.chatkitProjectId(),
      delegatedConversation?.conversationId ?? null,
      delegatedConversation?.requesterXpertId ?? null
    ])
  })
  readonly activeChatkitThreadId = computed(
    () => this.#workbenchConversationScope()?.threadId ?? this.facade.threadId()
  )
  readonly agentWorkbenchFixedSlot = AGENT_WORKBENCH_FIXED_SLOT
  readonly defaultFixedViewIcon = DEFAULT_FIXED_VIEW_ICON
  readonly startScreen = injectFrequentQuestionsStartScreen({
    xpert: computed(() => this.facade.currentXpert?.() ?? null),
    active: computed(() => this.facade.viewState() === 'ready' && !this.chatkitInitialThread())
  })
  readonly control = injectHostedAssistantChatkitControl({
    identity: computed(() => (this.facade.viewState() === 'ready' ? this.facade.identity() : null)),
    assistantId: this.chatkitAssistantId,
    frameUrl: this.facade.chatkitFrameUrl,
    requestContext: this.assistantRequestContext,
    projectId: this.chatkitProjectId,
    delegatedConversation: this.chatkitDelegatedConversation,
    composer: computed(() => ({
      projects: {
        enabled: this.#projectSelectionEnabled(),
        createEnabled: this.#projectSelectionEnabled()
      },
      connectors: { enabled: true }
    })),
    initialThread: this.chatkitInitialThread,
    startScreen: this.startScreen,
    displayMode: this.chatkitDisplayMode,
    layout: {
      maxWidth: CLAWXPERT_CHAT_COLUMN_MAX_WIDTH
    },
    taskSummary: {
      enabled: true
    },
    workbench: {
      sideChat: {
        enabled: true
      }
    },
    titleKey: this.facade.definition.titleKey,
    titleDefault: this.facade.definition.defaultTitle,
    onThreadChange: ({ threadId }) => {
      const normalizedThreadId = normalizeConversationThreadId(threadId)
      if (this.#workbenchConversationScope()) {
        if (normalizedThreadId) {
          this.#workbenchConversationScope.update((scope) =>
            scope ? { ...scope, threadId: normalizedThreadId } : null
          )
        }
        return
      }
      this.#chatkitOriginThreadId = normalizedThreadId
      this.facade.onChatThreadChange(threadId)
    },
    onProjectChange: ({ projectId }) => {
      if (this.#workbenchConversationScope()) {
        return
      }
      this.facade.onChatProjectChange?.(projectId)
    },
    onThreadLoadEnd: ({ threadId }) => {
      this.markChatkitThreadRead(threadId)
    },
    onEffect: (event) => {
      const projectName = getChatProjectCreateName(event)
      if (projectName) {
        void this.createChatProject(projectName)
        return
      }
      const taskSummaryTarget = getTaskSummaryResourceTarget(event)
      if (taskSummaryTarget) {
        void this.openTaskSummaryResource(taskSummaryTarget)
        return
      }
      const citationEvent = createKnowledgebaseCitationOpenHostEvent(event, {
        hostType: 'agent',
        hostId: this.facade.xpertId(),
        threadId: this.activeChatkitThreadId()
      })
      if (citationEvent) {
        this.publishKnowledgebaseCitationEvent(citationEvent)
      }
      if (this.activeChatkitThreadId() && shouldRefreshWorkspaceFilesFromEffectEvent(event)) {
        this.scheduleWorkspaceFileListRefresh()
      }
      const previewTarget = getSandboxPreviewTargetFromEffectEvent(event)
      if (this.activeChatkitThreadId() && previewTarget) {
        this.openBrowserTabFromSandboxEvent(previewTarget)
      }
    },
    onLog: (event) => {
      const toolCompletedEvent = createAssistantToolCompletedHostEvent(event, {
        hostType: 'agent',
        hostId: this.facade.xpertId(),
        threadId: this.activeChatkitThreadId(),
        runtimeScope: this.viewRuntimeScope(),
        userId: this.facade.userId()
      })
      if (toolCompletedEvent) {
        this.openToolArtifacts(toolCompletedEvent)
        console.info('[view-extension] publishing assistant tool completed host event', {
          toolName: toolCompletedEvent.toolName,
          hostType: toolCompletedEvent.hostType,
          hostId: toolCompletedEvent.hostId,
          threadId: toolCompletedEvent.threadId
        })
        this.#hostEvents.publish(toolCompletedEvent)
      }
      if (this.activeChatkitThreadId() && shouldRefreshWorkspaceFilesFromLogEvent(event)) {
        this.scheduleWorkspaceFileListRefresh()
      }
      const previewTarget = getSandboxPreviewTargetFromLogEvent(event)
      if (this.activeChatkitThreadId() && previewTarget) {
        this.openBrowserTabFromSandboxEvent(previewTarget)
      }
    },
    onResponseStart: () => {
      ++this.#generatedOutputRequest
      if (this.#generatedOutputThreadId !== this.activeChatkitThreadId()) this.#generatedOutputKeys.clear()
      this.#generatedOutputThreadId = this.activeChatkitThreadId()
      generatedConversationOutputs(this.resolvedConversation()).forEach((output) =>
        this.#generatedOutputKeys.add(generatedOutputKey(output))
      )
      this.#responseActive.set(true)
      if (!this.#workbenchConversationScope()) {
        this.facade.patchActiveConversationStatus('busy')
      }
    },
    onResponseEnd: () => {
      void this.openGeneratedOutputs()
      this.#responseActive.set(false)
      if (!this.#workbenchConversationScope()) {
        this.facade.patchActiveConversationStatus('idle')
      }
      this.markChatkitThreadRead(this.activeChatkitThreadId() ?? this.resolvedConversation()?.threadId)
    }
  })
  readonly chatkitMountEntries = computed(() => [{ key: this.chatkitMountKey(), control: this.control()! }])
  readonly workspaceTabs = signal<ClawXpertWorkspaceTab[]>([])
  readonly artifactTabs = computed(() =>
    this.workspaceTabs().filter((tab): tab is WorkbenchArtifactTab => tab.kind === 'artifact')
  )
  readonly browserTabs = computed<ClawXpertBrowserTab[]>(() =>
    this.workspaceTabs().filter((tab): tab is ClawXpertBrowserTab => tab.kind === 'browser')
  )
  readonly fixedViewTabs = computed<ClawXpertFixedViewTab[]>(() =>
    this.workspaceTabs().filter((tab): tab is ClawXpertFixedViewTab => tab.kind === 'fixed-view')
  )
  readonly activeTabId = signal<string>('')
  readonly activeTab = computed<ClawXpertWorkspaceTab | null>(() => {
    const tabs = this.workspaceTabs()
    return tabs.find((tab) => tab.id === this.activeTabId()) ?? null
  })
  readonly activeBrowserTab = computed(() => {
    const tab = this.activeTab()
    return tab?.kind === 'browser' ? tab : null
  })
  readonly activeFixedViewTab = computed(() => {
    const tab = this.activeTab()
    return tab?.kind === 'fixed-view' ? tab : null
  })
  readonly activePanel = computed<ClawXpertConversationPanel | null>(() => {
    const tab = this.activeTab()
    if (!tab) {
      return null
    }

    return tab.kind === 'browser' ? 'preview' : tab.kind
  })
  readonly fixedViewHostId = computed(() => (this.facade.viewState() === 'ready' ? this.facade.xpertId() : null))
  readonly loadingFixedViews = signal(false)
  readonly fixedViewError = signal<string | null>(null)
  readonly fixedViewMenuItems = signal<ClawXpertFixedViewMenuItem[]>([])
  readonly fixedViewMenuVisible = computed(
    () => this.loadingFixedViews() || Boolean(this.fixedViewError()) || this.fixedViewMenuItems().length > 0
  )
  readonly fileListReloadKey = signal(0)
  readonly resolvedConversationId = signal<string | null>(null)
  readonly resolvedConversation = signal<IChatConversation | null>(null)
  readonly viewRuntimeScope = computed<XpertViewRuntimeScopeInput>(() => {
    const projectId = this.runtimeProjectId()
    return {
      projectId,
      // Project-bound Workbench Views share one durable data scope. Switching
      // the inspected ChatKit execution inside that Project must update ChatKit
      // without invalidating and recreating the Remote View iframe.
      conversationId: projectId ? null : this.resolvedConversationId()
    }
  })
  readonly conversationFilesMode = computed<'editable' | 'readonly'>(() => {
    if (!this.runtimeProjectId()) {
      return 'editable'
    }
    return this.projectAccess()?.capabilities.canEdit === true ? 'editable' : 'readonly'
  })
  readonly contextLoading = signal(false)
  readonly contextError = signal<string | null>(null)
  readonly isChatMinimizedToPet = signal(false)
  readonly fileTreeTabs = computed(() => this.workspaceTabs().filter((tab) => tab.kind === 'files'))
  readonly artifactPanels = viewChildren(WorkbenchArtifactPanelComponent)
  readonly chatkitHost = viewChild('chatkitHost', { read: ElementRef<HTMLElement> })
  readonly detailPanelVisible = signal(false)
  readonly workspaceMaximized = signal(false)
  readonly chatkitLayoutMode = computed<'pet' | 'overlay' | 'pinned' | 'chat'>(() =>
    this.isChatMinimizedToPet()
      ? 'pet'
      : this.overlayDialog()
        ? 'overlay'
        : this.chatkitPinnedToRight()
          ? 'pinned'
          : 'chat'
  )
  readonly chatkitLayoutModeIconClasses = computed(() => {
    switch (this.chatkitLayoutMode()) {
      case 'pet':
        return 'ri-restart-line text-lg'
      case 'overlay':
      case 'chat':
        return 'ri-layout-right-line text-lg'
      case 'pinned':
        return 'ri-picture-in-picture-2-line text-lg'
    }
  })
  readonly chatkitLayoutActionLabel = computed(() => {
    switch (this.chatkitLayoutMode()) {
      case 'pet':
        return this.#translate.instant('XP.Chat.ClawXpert.RestoreChatkit', { Default: 'Restore ChatKit' })
      case 'overlay':
      case 'chat':
        return this.#translate.instant('XP.Chat.ClawXpert.PinOverlayDialog', {
          Default: 'Pin ChatKit to the right'
        })
      case 'pinned':
        return this.#translate.instant('XP.Chat.ClawXpert.SwitchToOverlayDialog', {
          Default: 'Switch ChatKit to overlay'
        })
    }
  })
  readonly #workbenchLayoutAssistantId = computed(
    () => this.facade.assistantId()?.trim() || this.facade.xpertId()?.trim() || null
  )
  readonly #workbenchLayoutState = computed<ClawXpertWorkbenchLayoutState>(() =>
    this.workspaceMaximized()
      ? 'maximized'
      : this.overlayDialog()
        ? 'overlay'
        : !this.detailPanelVisible()
          ? 'minimized'
          : 'normal'
  )
  readonly chatkitWidthPx = signal(CLAWXPERT_CHATKIT_DEFAULT_WIDTH_PX)
  readonly isResizingChatkit = signal(false)
  readonly chatkitMinWidth = CLAWXPERT_CHATKIT_MIN_WIDTH_PX
  readonly chatkitMaxWidth = CLAWXPERT_CHATKIT_MAX_WIDTH_PX
  readonly chatkitWidthStyle = computed(() => `${this.chatkitWidthPx()}px`)
  readonly workbenchMaximized = computed(() => this.workspaceMaximized() || this.isChatMinimizedToPet())
  readonly chatkitResizeGripClasses = computed(() =>
    this.isResizingChatkit()
      ? 'h-14 w-1 rounded-full bg-border opacity-100 transition-opacity'
      : 'h-14 w-1 rounded-full bg-border opacity-0 transition-opacity group-hover/resize:opacity-100'
  )
  readonly showDetailPanel = computed(
    () => this.detailPanelVisible() && (this.workspaceTabs().length === 0 || !!this.activePanel())
  )
  readonly immersiveWorkbench = computed(
    () =>
      this.facade.viewState() === 'ready' &&
      this.showDetailPanel() &&
      (this.workbenchMaximized() || this.overlayDialog())
  )
  readonly assistantTitle = computed(() => this.facade.assistantTitle?.() || this.facade.definition.defaultTitle)
  readonly workbenchLayoutAction = computed(() =>
    this.immersiveWorkbench()
      ? 'XP.Chat.WorkbenchPresentation.RestoreLayout'
      : 'XP.Chat.WorkbenchPresentation.MaximizeWorkbench'
  )
  readonly assistantAvatar = computed(() => this.facade.assistantAvatar?.() ?? undefined)
  readonly chatkitHiddenFromWorkspace = computed(
    () => !this.overlayDialog() && this.showDetailPanel() && this.workbenchMaximized()
  )
  readonly showChatkitResizeHandle = computed(
    () =>
      !this.overlayDialog() &&
      this.showDetailPanel() &&
      !this.isChatMinimizedToPet() &&
      !this.chatkitHiddenFromWorkspace()
  )
  readonly workspaceLayoutClasses = computed(() => {
    const transitionClasses = this.isResizingChatkit() ? 'transition-none' : WORKSPACE_LAYOUT_TRANSITION_CLASSES

    if (this.overlayDialog()) {
      return `grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_0rem] ${transitionClasses} lg:grid-cols-[minmax(0,1fr)_0rem] lg:grid-rows-1`
    }

    if (this.isChatMinimizedToPet()) {
      return this.showDetailPanel()
        ? `grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_0rem] ${transitionClasses} lg:grid-cols-[minmax(0,1fr)_0rem] lg:grid-rows-1`
        : `grid h-full min-h-0 grid-cols-1 grid-rows-[0rem_0rem] ${transitionClasses} lg:grid-cols-[0rem_0rem] lg:grid-rows-1`
    }

    if (this.chatkitHiddenFromWorkspace()) {
      return `grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_0rem] ${transitionClasses} lg:grid-cols-[minmax(0,1fr)_0rem] lg:grid-rows-1`
    }

    return this.showDetailPanel()
      ? `grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(24rem,32rem)] ${transitionClasses} lg:grid-cols-[minmax(0,1fr)_minmax(24rem,var(--clawxpert-chatkit-width))] lg:grid-rows-1`
      : `grid h-full min-h-0 grid-cols-1 grid-rows-[0rem_minmax(0,1fr)] ${transitionClasses} lg:grid-cols-[0rem_minmax(0,1fr)] lg:grid-rows-1`
  })
  readonly detailPanelShellClasses = computed(() =>
    this.showDetailPanel()
      ? `min-h-0 min-w-0 overflow-hidden ${DETAIL_PANEL_SHELL_TRANSITION_CLASSES} max-h-[120rem] translate-y-0 opacity-100 lg:translate-x-0 lg:translate-y-0`
      : `pointer-events-none min-h-0 min-w-0 overflow-hidden ${DETAIL_PANEL_SHELL_TRANSITION_CLASSES} max-h-0 -translate-y-4 opacity-0 lg:max-h-none lg:-translate-x-6 lg:translate-y-0`
  )
  readonly detailPanelContentClasses = computed(() =>
    this.showDetailPanel()
      ? `flex h-full min-h-0 flex-col overflow-hidden ${DETAIL_PANEL_CONTENT_TRANSITION_CLASSES} translate-y-0 opacity-100 lg:translate-x-0 lg:translate-y-0`
      : `pointer-events-none flex h-full min-h-0 flex-col overflow-hidden ${DETAIL_PANEL_CONTENT_TRANSITION_CLASSES} -translate-y-3 opacity-0 lg:-translate-x-3 lg:translate-y-0`
  )
  readonly chatShellClasses = computed(() => {
    if (this.overlayDialog()) {
      return `relative min-h-0 min-w-0 overflow-visible p-0 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-0 lg:max-w-0 lg:justify-self-end`
    }

    if (this.chatkitHiddenFromWorkspace()) {
      if (this.isChatMinimizedToPet()) {
        return `relative min-h-0 min-w-0 overflow-visible p-0 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-0 lg:max-w-0 lg:justify-self-end`
      }

      return `pointer-events-none relative min-h-0 min-w-0 overflow-hidden p-0 opacity-0 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-0 lg:max-w-0 lg:justify-self-end`
    }

    return this.showDetailPanel()
      ? `relative min-h-0 min-w-0 opacity-100 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-full lg:max-w-[var(--clawxpert-chatkit-width)] lg:justify-self-end`
      : `relative min-h-0 min-w-0 rounded-none border border-transparent bg-transparent shadow-none opacity-100 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-full`
  })
  readonly chatSurfaceClasses = computed(() =>
    this.showChatkitResizeHandle() ? 'bg-components-card-bg border-l border-border' : ''
  )

  constructor() {
    effect((onCleanup) => {
      if (this.immersiveWorkbench()) onCleanup(this.#presentation.enter())
    })
    this.#unregisterComposerCommand = registerAssistantComposerAppendReferencesCommand(this.#clientCommands, {
      getControl: () => this.control(),
      isReady: () => this.facade.viewState() === 'ready'
    })
    this.#unregisterAssistantCommand = registerAssistantChatSendMessageCommand(this.#clientCommands, {
      getControl: () => this.control(),
      isReady: () => this.facade.viewState() === 'ready',
      unavailableMessage: 'Current Assistant ChatKit is not ready.'
    })
    this.#unregisterAssistantContextCommand = registerAssistantContextSetCommand(this.#clientCommands, {
      setContext: (key, context) => {
        this.setAssistantWorkbenchContext(key, context)
      }
    })
    this.#unregisterBrowserOpenCommand = this.#clientCommands.register(WORKBENCH_BROWSER_OPEN_COMMAND, (payload) => {
      const target = toWorkbenchBrowserPreviewTarget(payload)
      if (!target) {
        return {
          success: false,
          code: 'invalid_payload',
          message: 'Workbench browser preview payload must include a URL.'
        }
      }

      const tab = this.openBrowserTabFromSandboxEvent(target)
      return {
        success: true,
        tabId: tab.id,
        url: tab.url ?? tab.displayUrl
      }
    })
    this.#unregisterFileOpenCommand = registerWorkbenchFileOpenCommand(this.#clientCommands, {
      openFile: (file) => {
        if (file.evidence) openWorkbenchFilePreviewDialog(this.#dialog, file)
        else this.openFileArtifact(file)
      }
    })
    this.#unregisterNavigationOpenCommand = registerWorkbenchNavigationOpenCommand(this.#clientCommands, {
      navigate: (commands, options) => this.#router.navigate(commands, options),
      openAssistantConversation: (request) => this.openWorkbenchAssistantConversation(request),
      openAssistantProject: (request) => openWorkbenchProject(request, this.fixedViewMenuItems(), this.facade),
      openWorkbenchView: (request) => this.openWorkbenchView(request)
    })

    effect(() => {
      const scope = this.#workbenchConversationScope()
      if (scope && scope.hostRouteKey !== this.#hostChatRouteKey()) {
        // The user navigated the primary Workbench while an external record was
        // open. Restore the primary Assistant runtime instead of carrying the
        // role Assistant's delegated session into the new host route.
        this.#workbenchConversationScope.set(null)
      }
    })

    effect(() => {
      const assistantId = this.#workbenchLayoutAssistantId()
      const userId = this.facade.userId()?.trim() || null
      const viewState = this.facade.viewState()
      const configuredInitialLayout = this.facade.initialLayout()
      const currentState = this.#workbenchLayoutState()
      const preferenceKey = assistantId ? JSON.stringify([userId, assistantId]) : null

      if (preferenceKey !== this.#activeWorkbenchLayoutPreferenceKey) {
        this.#activeWorkbenchLayoutPreferenceKey = preferenceKey
        this.#initializedWorkbenchLayoutPreferenceKey = null
        this.#pendingWorkbenchLayoutRestore = null
        this.#pendingChatkitPetRestore = null
        this.#pendingInitialOverlayOpen = false
      }

      if (!assistantId || !preferenceKey || viewState !== 'ready') {
        return
      }

      if (preferenceKey !== this.#initializedWorkbenchLayoutPreferenceKey) {
        this.#initializedWorkbenchLayoutPreferenceKey = preferenceKey
        const restoredState = userId ? this.#workbenchLayoutStorage.load(userId, assistantId) : null
        const configuredState = toConfiguredWorkbenchLayoutState(configuredInitialLayout)
        const nextState = restoredState ?? configuredState ?? 'minimized'
        this.#pendingChatkitPetRestore = {
          preferenceKey,
          // Maximized workbenches start with an overlay launcher, including saved legacy layouts.
          minimized:
            nextState === 'maximized' ||
            (userId ? (this.#workbenchLayoutStorage.loadChatkitPet(userId, assistantId) ?? false) : false)
        }
        this.#pendingWorkbenchLayoutRestore = { preferenceKey, state: nextState }
        this.applyWorkbenchLayoutState(nextState)
        return
      }

      const pendingRestore = this.#pendingWorkbenchLayoutRestore
      if (pendingRestore?.preferenceKey === preferenceKey && pendingRestore.state === currentState) {
        this.#pendingWorkbenchLayoutRestore = null
        return
      }

      this.#pendingWorkbenchLayoutRestore = null
      if (userId) {
        this.#workbenchLayoutStorage.save(userId, assistantId, currentState)
      }
    })

    effect(() => {
      const control = this.control()
      const threadId = this.facade.threadId()
      const viewState = this.facade.viewState()

      if (!control || viewState !== 'ready') {
        this.#activeChatkitControl = null
        this.#lastSyncedRoutedThreadId = null
        this.#chatkitOriginThreadId = null
        return
      }

      if (control !== this.#activeChatkitControl) {
        this.#activeChatkitControl = control
        this.#lastSyncedRoutedThreadId = threadId
        this.#chatkitOriginThreadId = null
        return
      }

      if (threadId === this.#chatkitOriginThreadId) {
        this.#lastSyncedRoutedThreadId = threadId
        this.#chatkitOriginThreadId = null
        return
      }

      this.#chatkitOriginThreadId = null
      if (threadId === this.#lastSyncedRoutedThreadId) {
        return
      }

      this.#lastSyncedRoutedThreadId = threadId
      this.#chatkitThreadSync = this.#chatkitThreadSync
        .catch(() => undefined)
        .then(async () => {
          if (
            this.control() !== control ||
            this.facade.threadId() !== threadId ||
            this.facade.viewState() !== 'ready'
          ) {
            return
          }
          await control.setThreadId(threadId)
        })
        .catch((error) => {
          this.#toastr.error(getErrorMessage(error) || 'Failed to switch the current conversation.')
        })
    })

    effect(() => {
      const hostId = this.fixedViewHostId()
      const runtimeScope = this.viewRuntimeScope()
      const scopeKey = `${hostId ?? 'none'}:${runtimeScope.projectId ?? 'personal'}:${runtimeScope.conversationId ?? 'new'}`
      if (scopeKey === this.#assistantWorkbenchContextScopeKey) {
        return
      }

      this.#assistantWorkbenchContextScopeKey = scopeKey
      this.#assistantWorkbenchContexts.set({})
    })

    effect((onCleanup) => {
      const hostId = this.fixedViewHostId()
      const runtimeScope = this.viewRuntimeScope()
      if (hostId !== this.#artifactScopeHostId || (runtimeScope.projectId ?? null) !== this.#artifactScopeProjectId) {
        this.#artifactScopeHostId = hostId
        this.#artifactScopeProjectId = runtimeScope.projectId ?? null
        this.clearArtifactTabs()
      }
      const scopeKey = `${runtimeScope.projectId ?? 'personal'}:${runtimeScope.conversationId ?? 'new'}`
      if (!hostId) {
        this.#fixedViewsHostId = null
        this.#fixedViewsScopeKey = null
        this.resetFixedViews(true)
        return
      }

      if (this.#fixedViewsHostId !== hostId) {
        this.#fixedViewsHostId = hostId
        this.#fixedViewsScopeKey = scopeKey
        this.resetFixedViews(true)
      } else if (this.#fixedViewsScopeKey !== scopeKey) {
        this.#fixedViewsScopeKey = scopeKey
      }

      let cancelled = false
      void this.loadFixedViews(hostId, runtimeScope, () => cancelled)

      onCleanup(() => {
        cancelled = true
      })
    })

    effect(() => {
      const requestedViewKey = this.#workbenchViewUrlState.viewKey()
      const hostId = this.fixedViewHostId()
      const loading = this.loadingFixedViews()
      const fixedTabs = this.fixedViewTabs()

      if (!hostId || loading) {
        return
      }

      if (requestedViewKey) {
        const requestedTab = findFixedViewTab(fixedTabs, requestedViewKey)
        if (requestedTab) {
          const requestedQuery = this.#workbenchViewUrlState.viewQuery()
          if (!equalViewQuery(requestedTab.query, requestedQuery)) {
            this.workspaceTabs.update((tabs) =>
              tabs.map((tab) =>
                tab.id === requestedTab.id && tab.kind === 'fixed-view' ? { ...tab, query: requestedQuery } : tab
              )
            )
          }
          this.activateWorkspaceTab(requestedTab.id, 'none')
          if (requestedTab.viewKey !== requestedViewKey) {
            void this.#workbenchViewUrlState.setViewState(requestedTab.viewKey, requestedQuery, { replaceUrl: true })
          }
          return
        }

        const fallbackTab = findFixedViewTab(fixedTabs, this.facade.defaultViewKey()) ?? fixedTabs[0]
        if (fallbackTab) {
          this.activateWorkspaceTab(fallbackTab.id, 'none')
          void this.#workbenchViewUrlState.setViewKey(fallbackTab.viewKey, { replaceUrl: true })
        } else {
          void this.#workbenchViewUrlState.setViewKey(null, { replaceUrl: true })
        }
        return
      }

      if (this.activeFixedViewTab()) {
        const fallbackTab = this.findLastNonFixedTab()
        if (fallbackTab) {
          this.activateWorkspaceTab(fallbackTab.id, 'none')
        } else {
          const activeFixedView = this.activeFixedViewTab()
          if (activeFixedView) {
            void this.#workbenchViewUrlState.setViewKey(activeFixedView.viewKey, { replaceUrl: true })
          }
        }
      }
    })

    effect((onCleanup) => {
      const chatkitHost = this.chatkitHost()?.nativeElement
      const viewState = this.facade.viewState()
      const overlayDialog = this.overlayDialog()

      if (viewState !== 'ready' || !chatkitHost) {
        this.removeOverlayDialogControls()
        this.isChatMinimizedToPet.set(false)
        return
      }

      const chatkitElement = resolveEmbeddedChatkitElement(chatkitHost)
      let petRestoreTimer: ReturnType<typeof setTimeout> | null = null
      let petRestoreAttempts = 0
      const syncMinimizedToPetState = () => {
        let minimizedToPet = isChatkitVisuallyMinimizedToPet(chatkitElement)
        const userId = this.facade.userId()?.trim() || null
        const assistantId = this.#workbenchLayoutAssistantId()
        const preferenceKey = assistantId ? JSON.stringify([userId, assistantId]) : null
        const pendingRestore = this.#pendingChatkitPetRestore
        const chatkitStateReady =
          chatkitElement.dataset.displayMode != null ||
          chatkitElement.dataset.chatOpen != null ||
          chatkitElement.dataset.chatMinimizedToPet != null
        const waitingForOverlay =
          overlayDialog && pendingRestore?.minimized && chatkitElement.dataset.displayMode !== 'pet'
        if (pendingRestore?.preferenceKey === preferenceKey && chatkitStateReady && !waitingForOverlay) {
          if (pendingRestore.minimized) {
            this.#pendingInitialOverlayOpen = false
            if (chatkitElement.dataset.chatOpen === 'true') {
              const closeElement = chatkitElement.shadowRoot?.querySelector<HTMLElement>('.ck-launcher-close')
              if (closeElement) {
                this.#pendingChatkitPetRestore = null
                closeElement.click()
                return
              }
              if (petRestoreAttempts < 100) {
                petRestoreAttempts += 1
                petRestoreTimer ??= setTimeout(() => {
                  petRestoreTimer = null
                  syncMinimizedToPetState()
                }, 50)
                return
              }
              this.#pendingChatkitPetRestore = null
            }
            minimizedToPet = true
          }
          this.#pendingChatkitPetRestore = null
        }
        this.isChatMinimizedToPet.set(minimizedToPet)
        if (userId && assistantId) {
          this.#workbenchLayoutStorage.saveChatkitPet(userId, assistantId, minimizedToPet)
        }
        if (minimizedToPet) {
          this.openDetailPanel()
        }
        if (overlayDialog) {
          this.ensureOverlayDialogControls(chatkitElement)
          this.openInitialOverlayDialog(chatkitElement)
        } else {
          this.removeOverlayDialogControls()
        }
      }

      syncMinimizedToPetState()

      if (typeof MutationObserver === 'undefined') {
        return
      }

      const observer = new MutationObserver(syncMinimizedToPetState)
      observer.observe(chatkitElement, {
        attributes: true,
        attributeFilter: [CHAT_MINIMIZED_TO_PET_ATTRIBUTE, CHATKIT_DISPLAY_MODE_ATTRIBUTE, CHATKIT_OPEN_ATTRIBUTE]
      })

      onCleanup(() => {
        if (petRestoreTimer) clearTimeout(petRestoreTimer)
        observer.disconnect()
        this.removeOverlayDialogControls()
        this.isChatMinimizedToPet.set(false)
      })
    })

    effect((onCleanup) => {
      const pendingStartId = this.facade.pendingConversationStartId()
      const control = this.control()

      if (!pendingStartId || this.facade.viewState() !== 'ready' || !control) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }

        void this.facade.beginPendingConversation(pendingStartId, control)
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })

    effect((onCleanup) => {
      const intent = this.#skillTrialIntent.peek()
      const control = this.control()

      if (!intent || this.facade.viewState() !== 'ready' || !control) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }

        const consumedIntent = this.#skillTrialIntent.consume()
        if (consumedIntent) {
          void this.applySkillTrialIntent(consumedIntent, control)
        }
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })

    effect((onCleanup) => {
      const control = this.control()
      const threadId = this.facade.threadId()
      const viewState = this.facade.viewState()
      const loadingUserPreference = this.facade.loadingUserPreference()

      this.facade.suppressAutoResume()

      if (!control || threadId || viewState !== 'ready' || loadingUserPreference) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }
        void this.facade.ensureConversationEntry(control)
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })

    effect((onCleanup) => {
      const threadId = this.facade.threadId()
      if (!threadId) {
        this.#responseActive.set(false)
        this.contextLoading.set(false)
        this.contextError.set(null)
        this.resolvedConversationId.set(null)
        this.resolvedConversation.set(null)
        this.facade.setActiveConversation(null)
        return
      }

      let cancelled = false
      this.#responseActive.set(false)
      this.contextLoading.set(true)
      this.contextError.set(null)
      this.resolvedConversationId.set(null)
      this.resolvedConversation.set(null)
      this.facade.setActiveConversation(null)

      void this.resolveConversationContext(threadId, () => cancelled)

      onCleanup(() => {
        cancelled = true
      })
    })
  }

  ngOnDestroy() {
    this.#destroyed = true
    ++this.#generatedOutputRequest
    this.artifactTabs().forEach(releaseArtifactTab)
    this.#unregisterComposerCommand?.()
    this.#unregisterComposerCommand = null
    this.#unregisterAssistantCommand?.()
    this.#unregisterAssistantCommand = null
    this.#unregisterAssistantContextCommand?.()
    this.#unregisterAssistantContextCommand = null
    this.#unregisterBrowserOpenCommand?.()
    this.#unregisterBrowserOpenCommand = null
    this.#unregisterFileOpenCommand?.()
    this.#unregisterFileOpenCommand = null
    this.#unregisterNavigationOpenCommand?.()
    this.#unregisterNavigationOpenCommand = null
    this.clearScheduledWorkspaceFileListRefresh()
    this.stopChatkitResize()
    this.removeOverlayDialogControls()
    this.#responseActive.set(false)
    this.#pendingInitialOverlayOpen = false
    this.isChatMinimizedToPet.set(false)
    this.facade.setActiveConversation(null)
  }

  private setAssistantWorkbenchContext(key: string, context: AssistantWorkbenchRequestContext | null) {
    const normalizedKey = key.trim()
    if (!normalizedKey || normalizedKey === 'env') {
      return
    }

    this.#assistantWorkbenchContexts.update((current) => {
      if (!context) {
        if (!current[normalizedKey]) {
          return current
        }

        const next = { ...current }
        delete next[normalizedKey]
        return next
      }

      const normalizedContext = normalizeAssistantWorkbenchContext(context)
      return {
        ...current,
        [normalizedKey]: normalizedContext
      }
    })
  }

  async handleWorkspaceReference(request: FileWorkbenchReferenceRequest) {
    if (isFileElementReferenceRequest(request)) {
      await this.attachComposerReferences([toFileElementQuoteReference(request)])
      return
    }

    if (isFilePathReferenceRequest(request)) {
      await this.attachComposerReferences([toFilePathQuoteReference(request)])
      return
    }

    await this.attachComposerReferences([
      {
        type: 'code',
        path: request.path,
        text: request.text,
        startLine: request.startLine,
        endLine: request.endLine,
        ...(request.language ? { language: request.language } : {})
      }
    ])
  }

  async handleElementReference(request: TChatElementReference) {
    await this.attachComposerReferences([toPageElementQuoteReference(request)])
  }

  toggleDetailPanel() {
    if (this.showDetailPanel()) {
      this.closeDetailPanel()
      return
    }

    this.openDetailPanel()
  }

  toggleChatkitLayoutMode() {
    switch (this.chatkitLayoutMode()) {
      case 'pet':
        this.restoreChatkitFromPet()
        return
      case 'overlay':
        this.pinOverlayChatkit()
        return
      case 'pinned':
        this.restoreOverlayChatkit()
        return
      case 'chat':
        this.restoreWorkbenchLayout()
    }
  }

  toggleWorkbenchMaximized() {
    if (this.immersiveWorkbench()) {
      this.restoreWorkbenchLayout(false)
      return
    }

    if (this.#activeWorkbenchLayoutPreferenceKey) {
      this.#pendingChatkitPetRestore = {
        preferenceKey: this.#activeWorkbenchLayoutPreferenceKey,
        minimized: true
      }
    }
    this.applyWorkbenchLayoutState('maximized')
    this.openDetailPanel()
  }

  restoreWorkbenchLayout(focusTab = true) {
    this.#pendingChatkitPetRestore = null
    if (this.isChatMinimizedToPet()) this.restoreChatkitFromPet()
    this.#pendingInitialOverlayOpen = false
    this.overlayDialog.set(false)
    this.workspaceMaximized.set(false)
    this.openDetailPanel()
    // The app menu fades away; keep keyboard focus in the surviving tab navigation.
    if (focusTab) this.#element.nativeElement.querySelector<HTMLElement>('[z-tab-link][data-active="true"]')?.focus()
  }

  openDetailPanel() {
    const tabs = this.workspaceTabs()
    if (tabs.length > 0 && !tabs.some((tab) => tab.id === this.activeTabId())) {
      this.activeTabId.set(tabs[0].id)
    }
    if (!this.overlayDialog()) {
      this.chatkitPinnedToRight.set(true)
    }
    this.detailPanelVisible.set(true)
  }

  closeDetailPanel() {
    if (this.overlayDialog()) {
      return
    }
    this.workspaceMaximized.set(false)
    this.chatkitPinnedToRight.set(false)
    this.detailPanelVisible.set(false)
  }

  private applyWorkbenchLayoutState(state: ClawXpertWorkbenchLayoutState) {
    this.#pendingInitialOverlayOpen = state === 'overlay'
    this.overlayDialog.set(state === 'overlay' || state === 'maximized')
    this.chatkitPinnedToRight.set(state === 'normal')
    this.detailPanelVisible.set(state !== 'minimized')
    this.workspaceMaximized.set(state === 'maximized')

    if (state === 'overlay') {
      const chatkitHost = this.chatkitHost()?.nativeElement
      if (chatkitHost) {
        this.openInitialOverlayDialog(resolveEmbeddedChatkitElement(chatkitHost))
      }
    }
  }

  pinOverlayChatkit() {
    if (!this.overlayDialog()) {
      return
    }

    this.#pendingInitialOverlayOpen = false
    this.chatkitPinnedToRight.set(true)
    this.overlayDialog.set(false)
    this.detailPanelVisible.set(true)
    this.workspaceMaximized.set(false)
  }

  restoreOverlayChatkit() {
    if (!this.chatkitPinnedToRight()) {
      return
    }

    this.#pendingInitialOverlayOpen = true
    this.chatkitPinnedToRight.set(false)
    this.overlayDialog.set(true)
    this.detailPanelVisible.set(true)
    this.workspaceMaximized.set(false)

    const chatkitHost = this.chatkitHost()?.nativeElement
    if (chatkitHost) {
      this.openInitialOverlayDialog(resolveEmbeddedChatkitElement(chatkitHost))
    }
  }

  private restoreChatkitFromPet() {
    const chatkitHost = this.chatkitHost()?.nativeElement
    if (!chatkitHost) {
      return
    }

    const chatkitElement = resolveEmbeddedChatkitElement(chatkitHost)
    const petElement = chatkitElement.shadowRoot?.querySelector<HTMLElement>('[data-chatkit-host-pet]')
    petElement?.click()
  }

  private openInitialOverlayDialog(chatkitElement: HTMLElement) {
    if (!this.#pendingInitialOverlayOpen || chatkitElement.dataset.displayMode !== 'pet') {
      return
    }
    if (chatkitElement.dataset.chatOpen === 'true') {
      this.#pendingInitialOverlayOpen = false
      return
    }

    const petElement = chatkitElement.shadowRoot?.querySelector<HTMLElement>('[data-chatkit-host-pet]')
    if (petElement) {
      this.#pendingInitialOverlayOpen = false
      petElement.click()
    }
  }

  private ensureOverlayDialogControls(chatkitElement: HTMLElement) {
    if (this.#overlayDialogControlsCleanup || chatkitElement.dataset.displayMode !== 'pet') {
      return
    }

    this.#overlayDialogControlsCleanup = installChatkitOverlayDialogControls(chatkitElement, {
      moveLabel: this.#translate.instant('XP.Chat.ClawXpert.MoveOverlayDialog', {
        Default: 'Move ChatKit dialog'
      }),
      resizeLabel: this.#translate.instant('XP.Chat.ClawXpert.ResizeOverlayDialog', {
        Default: 'Resize ChatKit dialog'
      })
    })
  }

  private removeOverlayDialogControls() {
    this.#overlayDialogControlsCleanup?.()
    this.#overlayDialogControlsCleanup = null
  }

  startChatkitResize(event: PointerEvent) {
    if (!this.showChatkitResizeHandle()) {
      return
    }

    event.preventDefault()
    this.stopChatkitResize()

    const startX = event.clientX
    const startWidth = this.chatkitWidthPx()
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    const target = event.currentTarget

    if (target instanceof HTMLElement && typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      this.chatkitWidthPx.set(clampChatkitWidth(startWidth + startX - moveEvent.clientX))
    }

    const handlePointerEnd = () => {
      this.stopChatkitResize()
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    this.isResizingChatkit.set(true)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd, { once: true })
    window.addEventListener('pointercancel', handlePointerEnd, { once: true })

    this.#chatkitResizeCleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      this.isResizingChatkit.set(false)
    }
  }

  resizeChatkitFromKeyboard(event: Event, delta: number) {
    event.preventDefault()
    this.chatkitWidthPx.update((width) => clampChatkitWidth(width + delta))
  }

  private stopChatkitResize() {
    this.#chatkitResizeCleanup?.()
    this.#chatkitResizeCleanup = null
  }

  selectPanel(panel: ClawXpertStaticTabId | 'preview') {
    if (panel === 'preview') {
      this.openBrowserTabFromSandboxEvent()
      return
    }

    const existingTab = this.workspaceTabs().find((tab) => tab.kind === panel)
    if (existingTab) {
      this.selectTab(existingTab.id)
      return
    }

    this.addWorkspaceTab(panel)
  }

  selectTab(tabId: string) {
    this.activateWorkspaceTab(tabId, 'push')
  }

  private activateWorkspaceTab(tabId: string, urlMode: 'none' | 'push' | 'replace') {
    const tab = this.workspaceTabs().find((candidate) => candidate.id === tabId)
    if (!tab) {
      return
    }

    this.activeTabId.set(tab.id)
    if (tab.kind === 'fixed-view') {
      if (urlMode !== 'none') {
        void this.#workbenchViewUrlState.setViewState(tab.viewKey, tab.query, { replaceUrl: urlMode === 'replace' })
      }
    } else {
      this.#lastNonFixedTabId = tab.id
      if (urlMode !== 'none') {
        void this.#workbenchViewUrlState.setViewKey(null, { replaceUrl: urlMode === 'replace' })
      }
    }
    if (urlMode !== 'none') {
      this.openDetailPanel()
    }
  }

  private findLastNonFixedTab() {
    const tabs = this.workspaceTabs()
    return (
      tabs.find((tab) => tab.kind !== 'fixed-view' && tab.id === this.#lastNonFixedTabId) ??
      tabs.find((tab) => tab.kind !== 'fixed-view') ??
      null
    )
  }

  addWorkspaceTab(kind: ClawXpertAddableWorkspaceTabKind) {
    if (kind === 'browser') {
      return this.addBrowserTab()
    }
    if (kind === 'tasks') {
      return this.openTasksTab()
    }

    const tab: ClawXpertToolTab = {
      id: this.createWorkspaceTabId(kind),
      kind
    }

    this.workspaceTabs.update((tabs) => [...tabs, tab])
    this.activateWorkspaceTab(tab.id, 'push')
    return tab
  }

  openTasksTab() {
    const existing = this.workspaceTabs().find((tab) => tab.kind === 'tasks')
    if (existing) {
      this.activateWorkspaceTab(existing.id, 'push')
      return existing
    }

    const tab: ClawXpertToolTab = {
      id: TASKS_WORKSPACE_TAB_ID,
      kind: 'tasks'
    }

    this.workspaceTabs.update((tabs) => [...tabs, tab])
    this.activateWorkspaceTab(tab.id, 'push')
    return tab
  }

  handleTasksChanged() {
    if (hasTaskSummaryRefresh(this.facade)) {
      this.facade.refreshTaskSummaries()
    }
  }

  async openTaskHistoryConversation(conversation: IChatConversation) {
    const threadId = normalizeConversationThreadId(conversation.threadId)
    if (!threadId) {
      this.#toastr.error(
        this.#translate.instant('XP.Chat.ClawXpert.TaskHistoryThreadMissing', {
          Default: 'This task history record has no conversation thread.'
        })
      )
      return
    }

    const control = this.control()
    if (!control) {
      this.#toastr.error(
        this.#translate.instant('XP.Chat.ClawXpert.ChatkitUnavailable', {
          Default: 'Chat is not ready yet.'
        })
      )
      return
    }

    try {
      this.revealChatkitForConversationOpen()
      if (conversation.id) {
        this.syncResolvedConversation(conversation.id, conversation)
      }
      await control.setThreadId(threadId)
      this.facade.onChatThreadChange(threadId)
      if (conversation.id) {
        this.markConversationRead(conversation.id)
      } else {
        this.markChatkitThreadRead(threadId)
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to open task history conversation.')
    }
  }

  async openWorkbenchAssistantConversation(request: WorkbenchAssistantConversationOpenRequest) {
    const requesterXpertId = this.facade.assistantId()?.trim() || this.facade.xpertId()?.trim()
    if (!requesterXpertId) {
      throw new Error('The current Workbench Assistant is not available.')
    }

    const resolution = await firstValueFrom(
      this.#conversationService.resolveWorkbenchNavigation(request.conversationId, requesterXpertId)
    )
    assertWorkbenchConversationHint('conversation', request.conversationId, resolution.conversationId)
    assertWorkbenchConversationHint('thread', request.threadId, resolution.threadId)
    assertWorkbenchConversationHint('Project', request.projectId, resolution.projectId)

    const currentAssistantId = this.facade.assistantId()?.trim() || null
    const requiresScopedRuntime =
      resolution.isExternalAssistant ||
      resolution.xpertId !== currentAssistantId ||
      resolution.projectId !== this.projectId()
    this.#workbenchConversationScope.set(
      requiresScopedRuntime
        ? {
            ...resolution,
            requesterXpertId,
            hostRouteKey: this.#hostChatRouteKey()
          }
        : null
    )
    // assistantId/projectId are part of the hosted runtime key. Yield so the
    // old delegated client secret and control are replaced before targeting
    // the canonical persisted thread.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    const control = this.control()
    if (!control) {
      throw new Error('Chat is not ready yet.')
    }

    this.revealChatkitForConversationOpen()
    if (!requiresScopedRuntime) {
      const conversation = await this.loadConversationDetail(resolution.conversationId)
      if (conversation) {
        this.syncResolvedConversation(resolution.conversationId, {
          ...conversation,
          id: resolution.conversationId,
          threadId: resolution.threadId
        })
      }
    }
    if (!requiresScopedRuntime) {
      await control.setThreadId(resolution.threadId)
      this.facade.onChatThreadChange(resolution.threadId)
    }
    this.markConversationRead(resolution.conversationId)
    return resolution
  }

  private revealChatkitForConversationOpen() {
    this.workspaceMaximized.set(false)
    if (this.isChatMinimizedToPet()) {
      this.restoreChatkitFromPet()
    }
    this.isChatMinimizedToPet.set(false)
  }

  openFixedViewTab(fixedView: ClawXpertFixedViewMenuItem) {
    const existing = this.fixedViewTabs().find((tab) => tab.viewKey === fixedView.viewKey)
    if (existing) {
      this.activateWorkspaceTab(existing.id, 'push')
      return existing
    }

    const tab = this.createFixedViewTab(fixedView)

    this.workspaceTabs.update((tabs) => [...tabs, tab])
    this.activateWorkspaceTab(tab.id, 'push')
    return tab
  }

  openArtifactTab(tab: WorkbenchArtifactTab) {
    tab = attachWorkspaceFile(tab, this.facade.xpertId(), this.resolvedConversationId(), this.runtimeProjectId())
    const previous = this.artifactTabs().find((item) => sameArtifact(item, tab))
    const panel = previous && this.artifactPanels().find((panel) => panel.tab().id === previous.id)
    if (previous && panel && (panel.document.dirty() || panel.document.saving())) {
      if (tab.resource.objectUrl !== previous.resource.objectUrl) releaseArtifactTab(tab)
      this.activateWorkspaceTab(previous.id, 'replace')
      return
    }
    const next = previous ? updateArtifactTab(previous, tab) : tab
    this.workspaceTabs.update((tabs) =>
      previous ? tabs.map((item) => (item.id === previous.id ? next : item)) : [...tabs, next]
    )
    this.activateWorkspaceTab(next.id, 'replace')
  }

  openFilesTab() {
    const existing = this.fileTreeTabs()[0]
    if (existing) this.activateWorkspaceTab(existing.id, 'push')
    else this.addWorkspaceTab('files')
  }

  private openFileArtifact(file: WorkbenchOpenFile, objectUrl?: string, resourceId?: string) {
    this.openArtifactTab(
      createFileArtifactTab(file, this.fixedViewHostId() ?? '', this.viewRuntimeScope(), objectUrl, resourceId)
    )
  }

  private openToolArtifacts(event: XpertViewHostEventMessage) {
    if (event.hostId !== this.fixedViewHostId() || event.threadId !== this.activeChatkitThreadId()) return
    for (const tab of fileTabsFromToolEvent(event, this.viewRuntimeScope())) this.openArtifactTab(tab)
  }

  private async openGeneratedOutputs() {
    const threadId = this.activeChatkitThreadId()
    const hostId = this.fixedViewHostId()
    const projectId = this.runtimeProjectId()
    const request = ++this.#generatedOutputRequest
    if (!threadId || !hostId) return
    try {
      const base =
        this.resolvedConversationId() ?? (await firstValueFrom(this.#conversationService.getByThreadId(threadId)))?.id
      if (!base) return
      const conversation = await this.loadConversationDetail(base)
      if (
        request !== this.#generatedOutputRequest ||
        threadId !== this.activeChatkitThreadId() ||
        hostId !== this.fixedViewHostId() ||
        projectId !== this.runtimeProjectId()
      )
        return
      this.#generatedOutputThreadId = threadId
      for (const output of generatedConversationOutputs(conversation)) {
        if (
          request !== this.#generatedOutputRequest ||
          threadId !== this.activeChatkitThreadId() ||
          hostId !== this.fixedViewHostId() ||
          projectId !== this.runtimeProjectId()
        )
          return
        const key = generatedOutputKey(output)
        if (this.#generatedOutputKeys.has(key)) continue
        this.#generatedOutputKeys.add(key)
        const target = getTaskSummaryResourceTarget({
          name: 'task_summary.open_resource',
          data: {
            conversationId: base,
            title: output.title,
            resource: output.resource
          }
        })
        if (target) await this.openTaskSummaryResource(target)
      }
    } catch {
      // The response remains usable when its persisted outputs have not arrived yet.
    }
  }

  openWorkbenchView(request: WorkbenchExtensionViewOpenRequest) {
    const menuItem = findResolvedViewByKey(this.fixedViewMenuItems(), request.viewKey)
    if (!menuItem) throw new Error(`Workbench view '${request.viewKey}' is not available.`)
    const resolvedViewKey = menuItem.viewKey
    const query: XpertViewQuery = {
      ...(request.selectionId ? { selectionId: request.selectionId } : {}),
      ...(request.parameters ? { parameters: request.parameters } : {})
    }
    const existing = this.fixedViewTabs().find((tab) => tab.viewKey === resolvedViewKey)
    if (existing) {
      this.workspaceTabs.update((tabs) =>
        tabs.map((tab) => (tab.kind === 'fixed-view' && tab.viewKey === resolvedViewKey ? { ...tab, query } : tab))
      )
    }
    const opened = this.openFixedViewTab(menuItem)
    if (!existing) {
      this.workspaceTabs.update((tabs) => tabs.map((tab) => (tab.id === opened.id ? { ...tab, query } : tab)))
    }
    return opened
  }

  addBrowserTab(initial?: Partial<Pick<ClawXpertBrowserTab, 'serviceId' | 'url' | 'displayUrl'>>) {
    const tab: ClawXpertBrowserTab = {
      id: this.createWorkspaceTabId('browser'),
      kind: 'browser',
      serviceId: initial?.serviceId ?? null,
      url: initial?.url ?? null,
      displayUrl: initial?.displayUrl ?? null,
      zoom: DEFAULT_BROWSER_ZOOM,
      deviceToolbarVisible: false,
      reloadKey: 0
    }

    this.workspaceTabs.update((tabs) => [...tabs, tab])
    this.activateWorkspaceTab(tab.id, 'push')
    return tab
  }

  closeWorkspaceTab(event: Event, tabId: string) {
    event.preventDefault()
    event.stopPropagation()

    const panel = this.artifactPanels().find((panel) => panel.tab().id === tabId)
    if (panel) {
      void panel.document.guardDirtyBefore(() => this.removeWorkspaceTab(tabId))
      return
    }
    this.removeWorkspaceTab(tabId)
  }

  private removeWorkspaceTab(tabId: string) {
    const tabs = this.workspaceTabs()
    const closedIndex = tabs.findIndex((tab) => tab.id === tabId)
    if (closedIndex < 0) {
      return
    }

    const nextTabs = tabs.filter((tab) => tab.id !== tabId)
    const closedTab = tabs[closedIndex]
    if (closedTab.kind === 'artifact') releaseArtifactTab(closedTab)
    this.workspaceTabs.set(nextTabs)
    if (this.activeTabId() !== tabId && nextTabs.length > 0) {
      return
    }

    const fallbackTab = nextTabs[Math.min(closedIndex, nextTabs.length - 1)]
    if (fallbackTab) {
      this.activateWorkspaceTab(fallbackTab.id, 'push')
    } else {
      this.activeTabId.set('')
      void this.#workbenchViewUrlState.setViewKey(null)
    }
  }

  updateActiveBrowserTab(change: ClawXpertBrowserTabChange) {
    const tab = this.activeBrowserTab()
    if (!tab) {
      return
    }

    this.updateBrowserTab(tab.id, change)
  }

  private openBrowserTabFromSandboxEvent(target: ClawXpertSandboxPreviewTarget = {}) {
    const matchedTab = this.findBrowserTabForPreviewTarget(target)
    if (matchedTab) {
      this.updateBrowserTab(matchedTab.id, {
        ...(target.displayUrl !== undefined ? { displayUrl: target.displayUrl } : {}),
        ...(target.serviceId !== undefined ? { serviceId: target.serviceId } : {}),
        ...(target.url !== undefined ? { url: target.url } : {})
      })
      this.activateWorkspaceTab(matchedTab.id, 'push')
      return matchedTab
    }

    const reusableTab = this.browserTabs().find((tab) => !tab.serviceId && !tab.url)
    if (reusableTab) {
      this.updateBrowserTab(reusableTab.id, {
        ...(target.displayUrl !== undefined ? { displayUrl: target.displayUrl } : {}),
        ...(target.serviceId !== undefined ? { serviceId: target.serviceId } : {}),
        ...(target.url !== undefined ? { url: target.url } : {})
      })
      this.activateWorkspaceTab(reusableTab.id, 'push')
      return reusableTab
    }

    return this.addBrowserTab({
      displayUrl: target.displayUrl ?? null,
      serviceId: target.serviceId ?? null,
      url: target.url ?? null
    })
  }

  private async openTaskSummaryResource(target: ClawXpertTaskSummaryResourceTarget) {
    const hostId = this.fixedViewHostId()
    const threadId = this.activeChatkitThreadId()
    const projectId = this.runtimeProjectId()
    const isCurrent = () =>
      !this.#destroyed &&
      hostId === this.fixedViewHostId() &&
      threadId === this.activeChatkitThreadId() &&
      projectId === this.runtimeProjectId()
    try {
      const currentConversationId = this.resolvedConversationId() ?? this.resolvedConversation()?.id ?? null
      if (target.conversationId && currentConversationId && target.conversationId !== currentConversationId) {
        throw new Error('Task summary resource belongs to another conversation.')
      }
      const conversationId = target.conversationId ?? currentConversationId
      switch (target.type) {
        case 'workspace_file': {
          if (!conversationId) {
            throw new Error('Conversation context is required to open a workspace file.')
          }
          const file = await firstValueFrom(
            this.#conversationService.getFile(conversationId, target.workspacePath, undefined, target.fileAssetId, true)
          )
          if (!isCurrent()) return
          let objectUrl: string | null = null
          let url = readHttpUrl(file.fileUrl ?? file.url)
          if (!url) {
            const blob = await firstValueFrom(
              this.#conversationService.downloadFile(conversationId, target.workspacePath)
            )
            if (!isCurrent()) return
            objectUrl = URL.createObjectURL(blob)
            url = objectUrl
          }
          this.openFileArtifact(
            {
              id: target.fileAssetId,
              fileAssetId: target.fileAssetId,
              storageFileId: target.storageFileId,
              name: target.title ?? target.workspacePath.split('/').pop() ?? target.workspacePath,
              mimeType: file.mimeType,
              size: file.size,
              url,
              previewUrl: url
            },
            objectUrl ?? undefined,
            target.workspacePath
          )
          return
        }
        case 'artifact': {
          const link = await firstValueFrom(this.#artifactService.createSignedPreviewLink(target.artifactId))
          if (!isCurrent()) return
          const url = readHttpUrl(link.publicUrl)
          if (!url) {
            throw new Error('Artifact preview URL is unavailable.')
          }
          const version = link.version ?? link.artifact?.currentVersion ?? null
          const mimeType = version?.mimeType ?? undefined
          const title = target.title ?? version?.title ?? link.artifact?.title ?? version?.fileName ?? 'Artifact'
          this.openFileArtifact({
            id: link.artifactId,
            name: title,
            mimeType,
            size: version?.size ?? undefined,
            url,
            previewUrl: url
          })
          return
        }
        case 'browser': {
          this.openBrowserTabFromSandboxEvent({
            displayUrl: target.title ?? target.url ?? null,
            serviceId: target.serviceId ?? null,
            url: target.url ?? null
          })
          return
        }
        case 'url': {
          this.openBrowserTabFromSandboxEvent({
            displayUrl: target.title ?? target.url,
            url: target.url
          })
          return
        }
      }
    } catch (error) {
      if (isCurrent()) this.#toastr.error(getErrorMessage(error) || 'Failed to open task summary resource.')
    }
  }

  private findBrowserTabForPreviewTarget(target: ClawXpertSandboxPreviewTarget) {
    return this.browserTabs().find((tab) => isMatchingBrowserTab(tab, target)) ?? null
  }

  private updateBrowserTab(tabId: string, change: ClawXpertBrowserTabChange) {
    this.workspaceTabs.update((tabs) =>
      tabs.map((tab) =>
        tab.kind === 'browser' && tab.id === tabId
          ? {
              ...tab,
              ...change
            }
          : tab
      )
    )
  }

  private createWorkspaceTabId(kind: ClawXpertWorkspaceTabKind) {
    return `${kind}-${Date.now()}-${this.workspaceTabs().length + 1}`
  }

  private async createChatProject(name: string) {
    const assistantId = this.facade.assistantId()?.trim()
    if (!assistantId || this.facade.threadId()?.trim() || this.#projectCreatePending) {
      return
    }

    this.#projectCreatePending = true
    try {
      const project = await firstValueFrom(
        this.#projectApi.create({
          name,
          xpertIds: [assistantId]
        })
      )
      this.facade.onChatProjectChange?.(project.id)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to create the Project.')
    } finally {
      this.#projectCreatePending = false
    }
  }

  private async loadFixedViews(hostId: string, runtimeScope: XpertViewRuntimeScopeInput, isCancelled: () => boolean) {
    const version = ++this.#fixedViewsLoadVersion
    this.loadingFixedViews.set(true)
    this.fixedViewError.set(null)

    try {
      const manifests = await firstValueFrom(
        this.#viewExtensionApi.getSlotViews('agent', hostId, AGENT_WORKBENCH_FIXED_SLOT, { runtimeScope })
      )
      if (isCancelled() || version !== this.#fixedViewsLoadVersion || this.#fixedViewsHostId !== hostId) {
        return
      }

      const items = manifests
        .filter((manifest) => shouldShowFixedViewInMenu(manifest))
        .map((manifest) => this.toFixedViewMenuItem(manifest))
        .sort((a, b) => a.order - b.order)

      this.fixedViewMenuItems.set(items)
      this.syncFixedViewTabs(items)
    } catch (error) {
      if (isCancelled() || version !== this.#fixedViewsLoadVersion || this.#fixedViewsHostId !== hostId) {
        return
      }

      this.fixedViewError.set(getErrorMessage(error) || 'Failed to load fixed views')
      this.fixedViewMenuItems.set([])
    } finally {
      if (!isCancelled() && version === this.#fixedViewsLoadVersion && this.#fixedViewsHostId === hostId) {
        this.loadingFixedViews.set(false)
      }
    }
  }

  private resetFixedViews(removeTabs: boolean) {
    if (removeTabs) this.clearArtifactTabs()
    this.#fixedViewsLoadVersion += 1
    this.loadingFixedViews.set(false)
    this.fixedViewError.set(null)
    this.fixedViewMenuItems.set([])
    if (removeTabs) {
      this.removeFixedViewTabs()
    }
  }

  private clearArtifactTabs() {
    untracked(() => {
      const artifacts = this.artifactTabs()
      if (!artifacts.length) return
      artifacts.forEach(releaseArtifactTab)
      const tabs = this.workspaceTabs().filter((tab) => tab.kind !== 'artifact')
      this.workspaceTabs.set(tabs)
      if (!tabs.some((tab) => tab.id === this.activeTabId())) this.activeTabId.set(tabs[0]?.id ?? '')
    })
  }

  private removeFixedViewTabs() {
    const tabs = this.workspaceTabs()
    if (!tabs.some((tab) => tab.kind === 'fixed-view')) {
      return
    }

    const nextTabs = tabs.filter((tab) => tab.kind !== 'fixed-view')
    this.workspaceTabs.set(nextTabs)
    if (!nextTabs.some((tab) => tab.id === this.activeTabId())) {
      this.activeTabId.set(nextTabs[0]?.id ?? '')
    }
  }

  private syncFixedViewTabs(items: ClawXpertFixedViewMenuItem[]) {
    const itemByViewKey = new Map(items.map((item) => [item.viewKey, item]))
    const tabs = this.workspaceTabs()
    const fixedTabsByViewKey = new Map(
      tabs.filter((tab): tab is ClawXpertFixedViewTab => tab.kind === 'fixed-view').map((tab) => [tab.viewKey, tab])
    )
    const nextFixedTabs = items.map((item) => {
      const tab = fixedTabsByViewKey.get(item.viewKey)
      if (!tab) {
        return this.createFixedViewTab(item)
      }

      if (tab.title === item.title && tab.icon === item.icon) {
        return tab
      }

      return {
        ...tab,
        title: item.title,
        icon: item.icon
      }
    })
    const nextNonFixedTabs = tabs.filter((tab) => tab.kind !== 'fixed-view')
    const nextTabs: ClawXpertWorkspaceTab[] = [...nextNonFixedTabs, ...nextFixedTabs]
    const changed =
      nextTabs.length !== tabs.length ||
      nextTabs.some((tab, index) => tab !== tabs[index]) ||
      tabs.some((tab) => tab.kind === 'fixed-view' && !itemByViewKey.has(tab.viewKey))

    if (changed) {
      this.workspaceTabs.set(nextTabs)
    }

    const activeTabId = this.activeTabId()
    const requestedViewKey = this.#workbenchViewUrlState.viewKey()
    const requestedTab = findFixedViewTab(nextFixedTabs, requestedViewKey)

    if (requestedTab) {
      this.activeTabId.set(requestedTab.id)
    } else if (!activeTabId) {
      const initialTab =
        nextNonFixedTabs[0] ?? findFixedViewTab(nextFixedTabs, this.facade.defaultViewKey()) ?? nextFixedTabs[0]
      this.activeTabId.set(initialTab?.id ?? '')
    } else if (activeTabId && !nextTabs.some((tab) => tab.id === activeTabId)) {
      const selectedTab = nextNonFixedTabs[0] ?? nextTabs[0]
      this.activeTabId.set(selectedTab?.id ?? '')
    }

    if (nextFixedTabs.length === 0 && requestedViewKey) {
      void this.#workbenchViewUrlState.setViewKey(null, { replaceUrl: true })
    }
  }

  private publishKnowledgebaseCitationEvent(event: XpertViewHostEventMessage) {
    const target = getKnowledgebaseCitationTarget(event)
    const openedWorkbench = target ? this.focusKnowledgebaseWorkbenchTab(target) : false
    this.#hostEvents.publish(event)

    if (!openedWorkbench && target) {
      void this.openKnowledgebaseCitationFallback(target)
    }
  }

  private focusKnowledgebaseWorkbenchTab(target: KnowledgebaseCitationTarget) {
    if (target.faqId || target.wikiPageId || !target.documentId) {
      return false
    }
    const menuItem = findResolvedViewByKey(this.fixedViewMenuItems(), KNOWLEDGEBASE_WORKBENCH_VIEW_KEY)
    if (!menuItem) {
      return false
    }

    this.openWorkbenchView({
      viewKey: menuItem.viewKey,
      parameters: {
        ...(target.knowledgebaseId ? { knowledgebaseId: target.knowledgebaseId } : {}),
        documentId: target.documentId,
        ...(target.chunkId ? { chunkId: target.chunkId } : {})
      }
    })
    return true
  }

  private openKnowledgebaseCitationFallback(target: KnowledgebaseCitationTarget) {
    if (!target.knowledgebaseId) {
      return Promise.resolve(false)
    }

    if (target.faqId) {
      return this.#router.navigate(['/xpert/knowledges', target.knowledgebaseId, 'faq'], {
        queryParams: { faqId: target.faqId }
      })
    }

    if (target.wikiPageId) {
      return this.#router.navigate(['/xpert/knowledges', target.knowledgebaseId, 'wiki'], {
        queryParams: {
          wikiPageId: target.wikiPageId,
          ...(target.section ? { section: target.section } : {})
        }
      })
    }

    if (!target.documentId) {
      return Promise.resolve(false)
    }

    const queryParams: Record<string, string> = {}
    if (target.chunkId) queryParams['chunkId'] = target.chunkId
    if (target.page) {
      queryParams['view'] = 'analysis'
      queryParams['page'] = String(target.page)
    } else if (target.chunkId) {
      queryParams['view'] = 'chunks'
    }
    if (target.sourceBlockIds?.[0]) queryParams['block'] = target.sourceBlockIds[0]

    return this.#router.navigate(
      ['/xpert/knowledges', target.knowledgebaseId, 'documents', target.documentId],
      Object.keys(queryParams).length || target.evidenceText
        ? {
            ...(Object.keys(queryParams).length ? { queryParams } : {}),
            ...(target.evidenceText
              ? {
                  state: {
                    knowledgeEvidence: {
                      text: target.evidenceText.slice(0, 4000),
                      ...(target.chunkId ? { chunkId: target.chunkId } : {}),
                      ...(target.page ? { page: target.page } : {}),
                      ...(target.sourceBlockIds?.length ? { sourceBlockIds: target.sourceBlockIds } : {})
                    }
                  }
                }
              : {})
          }
        : undefined
    )
  }

  private createFixedViewTab(fixedView: ClawXpertFixedViewMenuItem): ClawXpertFixedViewTab {
    const requestedQuery = findResolvedViewByKey([fixedView], this.#workbenchViewUrlState.viewKey())
      ? this.#workbenchViewUrlState.viewQuery()
      : null
    return {
      id: `fixed-view-${fixedView.viewKey}`,
      kind: 'fixed-view',
      viewKey: fixedView.viewKey,
      title: fixedView.title,
      icon: fixedView.icon,
      query: requestedQuery
    }
  }

  private toFixedViewMenuItem(manifest: XpertExtensionViewManifest): ClawXpertFixedViewMenuItem {
    const menu = manifest.workbench?.menu
    return {
      viewKey: manifest.key,
      title: resolveI18nText(menu?.label ?? manifest.title, manifest.key, this.#translate.currentLang),
      description: resolveI18nText(manifest.description, '', this.#translate.currentLang) || null,
      icon: menu?.icon ?? manifest.icon ?? null,
      order: menu?.order ?? manifest.order ?? Number.MAX_SAFE_INTEGER
    }
  }

  private async attachComposerReferences(references: ChatKitReference[]) {
    const control = this.control()
    if (!control?.element) {
      this.#toastr.warning('XP.Chat.ClawXpert.ReferenceUnavailable', {
        Default: 'Chat composer is not ready yet. Try again in a moment.'
      })
      return
    }

    try {
      await control.setComposerValue({
        references,
        appendReferences: true
      })
      await control.focusComposer()
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) || 'XP.Chat.ClawXpert.ReferenceAttachFailed',
        'XP.TOASTR.TITLE.ERROR',
        {
          Default: 'Failed to attach the selected reference.'
        }
      )
    }
  }

  private async applySkillTrialIntent(intent: ClawXpertSkillTrialIntent, control: ChatKitControl) {
    const selection = toSkillTrialRuntimeCapabilities(intent)
    const prompt = readNonEmptyString(intent.prompt)

    try {
      setWritableSignalValue(this.facade.suppressAutoResume, true)
      await control.setThreadId(null)
      await control.setRuntimeCapabilities(selection)
      await control.setComposerValue({
        ...(prompt ? { text: prompt } : {}),
        runtimeCapabilities: selection,
        insertRuntimeCapabilities: true
      })
      await control.focusComposer()
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('XP.Plugin.TryInClawXpertFailed', {
            Default: 'Failed to prepare ClawXpert for this skill.'
          })
      )
    }
  }

  private scheduleWorkspaceFileListRefresh() {
    this.openDetailPanelForWorkspaceFileEvent()
    this.clearScheduledWorkspaceFileListRefresh()
    this.#workspaceFileRefreshTimer = setTimeout(() => {
      this.#workspaceFileRefreshTimer = null
      this.fileListReloadKey.update((value) => value + 1)
    }, WORKSPACE_FILE_REFRESH_DEBOUNCE_MS)
  }

  private openDetailPanelForWorkspaceFileEvent() {
    const filesTab = this.workspaceTabs().find((tab) => tab.kind === 'files')
    if (filesTab) {
      if (!this.showDetailPanel()) {
        this.activateWorkspaceTab(filesTab.id, 'push')
        return
      }
      this.openDetailPanel()
      return
    }

    this.addWorkspaceTab('files')
  }

  private clearScheduledWorkspaceFileListRefresh() {
    if (!this.#workspaceFileRefreshTimer) {
      return
    }

    clearTimeout(this.#workspaceFileRefreshTimer)
    this.#workspaceFileRefreshTimer = null
  }

  private async resolveConversationContext(threadId: string, isCancelled: () => boolean) {
    let conversationId: string | null = null
    let baseConversation: IChatConversation | null = null

    try {
      const thread = (await firstValueFrom(this.#threadService.getThread(threadId))) as {
        metadata?: { id?: string }
      } | null
      if (isCancelled() || this.facade.threadId() !== threadId) {
        return
      }

      conversationId = resolveConversationId(thread?.metadata)
    } catch (error) {
      if (isCancelled() || this.facade.threadId() !== threadId) {
        return
      }

      this.contextError.set(getErrorMessage(error) || 'Failed to resolve the current thread metadata.')
    }

    try {
      if (!conversationId) {
        baseConversation = (await firstValueFrom(
          this.#conversationService.getByThreadId(threadId)
        )) as IChatConversation | null
        if (isCancelled() || this.facade.threadId() !== threadId) {
          return
        }

        conversationId = baseConversation?.id ?? null
      }

      this.resolvedConversationId.set(conversationId)

      if (!conversationId) {
        this.resolvedConversation.set(null)
        this.facade.setActiveConversation(null)
        this.contextError.set(null)
        return
      }

      const conversation = await this.loadConversationDetail(conversationId)
      if (isCancelled() || this.facade.threadId() !== threadId) {
        return
      }

      this.syncResolvedConversation(conversationId, conversation ?? baseConversation)
      this.markConversationRead(conversationId)
      this.contextError.set(null)
    } catch (error) {
      if (isCancelled() || this.facade.threadId() !== threadId) {
        return
      }

      if (conversationId) {
        this.syncResolvedConversation(conversationId, baseConversation)
        this.markConversationRead(conversationId)
      } else {
        this.resolvedConversationId.set(null)
        this.resolvedConversation.set(null)
        this.facade.setActiveConversation(null)
      }

      this.contextError.set(getErrorMessage(error) || 'Failed to resolve the current conversation context.')
    } finally {
      if (!isCancelled() && this.facade.threadId() === threadId) {
        this.contextLoading.set(false)
      }
    }
  }

  private async loadConversationDetail(conversationId: string) {
    return (await firstValueFrom(
      this.#conversationService.getById(conversationId, {
        relations: [...CONVERSATION_DETAIL_RELATIONS]
      })
    )) as IChatConversation | null
  }

  private syncResolvedConversation(conversationId: string, conversation: IChatConversation | null) {
    const nextConversation = this.withRuntimeConversationStatus(conversation)

    this.resolvedConversationId.set(nextConversation?.id ?? conversationId)
    this.resolvedConversation.set(nextConversation)
    this.facade.setActiveConversation(nextConversation)
  }

  private withRuntimeConversationStatus(conversation: IChatConversation | null) {
    if (!conversation) {
      return null
    }

    if (!this.#responseActive()) {
      return conversation
    }

    return {
      ...conversation,
      status: 'busy'
    } as IChatConversation
  }

  private markChatkitThreadRead(threadId: string | null | undefined) {
    const normalizedThreadId = normalizeConversationThreadId(threadId)
    if (!normalizedThreadId) {
      return
    }

    const requestVersion = ++this.#markReadRequestVersion
    void this.resolveConversationIdForRead(normalizedThreadId, requestVersion)
  }

  private async resolveConversationIdForRead(threadId: string, requestVersion: number) {
    const resolvedConversation = this.resolvedConversation()
    if (normalizeConversationThreadId(resolvedConversation?.threadId) === threadId && resolvedConversation?.id) {
      this.markConversationRead(resolvedConversation.id)
      return
    }

    let conversationId: string | null = null
    try {
      const thread = (await firstValueFrom(this.#threadService.getThread(threadId))) as {
        metadata?: { id?: string }
      } | null
      conversationId = resolveConversationId(thread?.metadata)
    } catch {
      conversationId = null
    }

    if (requestVersion !== this.#markReadRequestVersion) {
      return
    }

    if (!conversationId) {
      try {
        const conversation = (await firstValueFrom(
          this.#conversationService.getByThreadId(threadId)
        )) as IChatConversation | null
        conversationId = conversation?.id ?? null
      } catch {
        conversationId = null
      }
    }

    if (requestVersion !== this.#markReadRequestVersion || !conversationId) {
      return
    }

    this.markConversationRead(conversationId)
  }

  private markConversationRead(conversationId: string | null | undefined) {
    if (!conversationId) {
      return
    }

    void firstValueFrom(this.#conversationService.markRead(conversationId)).catch(() => undefined)
  }
}
