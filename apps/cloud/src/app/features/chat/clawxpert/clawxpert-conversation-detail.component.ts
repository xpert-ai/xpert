import { CommonModule } from '@angular/common'
import { Dialog } from '@angular/cdk/dialog'
import { Component, computed, effect, ElementRef, inject, OnDestroy, Signal, signal, viewChild } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatKit, type ChatKitControl, type CreateChatKitOptions } from '@xpert-ai/chatkit-angular'
import type { ChatKitQuoteReference, ChatKitReference, RuntimeCapabilitiesSelection } from '@xpert-ai/chatkit-types'
import { ASSISTANT_CITATION_OPEN_EVENT, XpertWorkbenchInitialLayoutEnum } from '@xpert-ai/contracts'
import type {
  IconDefinition,
  I18nObject,
  TChatElementReference,
  TChatFileElementReference,
  XpertExtensionViewManifest,
  WorkbenchAssistantConversationResolution,
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
import type { FileWorkbenchFilePathReferenceRequest, FileWorkbenchReferenceRequest } from '../../../@shared/files'
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
  registerAssistantContextSetCommand,
  type AssistantContextSetPayload
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

const WORKSPACE_FILE_REFRESH_DEBOUNCE_MS = 300
const CONVERSATION_DETAIL_RELATIONS = ['messages']
const CHAT_MINIMIZED_TO_PET_ATTRIBUTE = 'data-chat-minimized-to-pet'
const CHATKIT_DISPLAY_MODE_ATTRIBUTE = 'data-display-mode'
const CHATKIT_OPEN_ATTRIBUTE = 'data-chat-open'

function getChatProjectCreateName(event: { name: string; data?: Record<string, unknown> }): string | null {
  if (event.name !== 'project.create') {
    return null
  }

  const name = event.data?.['name']
  return typeof name === 'string' && name.trim() ? name.trim() : null
}
const CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE = 'data-chatkit-overlay-drag-bar'
const CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE = 'data-chatkit-overlay-resize-handle'
const CHATKIT_OVERLAY_CONTROLS_STYLE_ATTRIBUTE = 'data-chatkit-overlay-controls-style'
const CLAWXPERT_CHATKIT_MIN_WIDTH_PX = 384
const CLAWXPERT_CHATKIT_DEFAULT_WIDTH_PX = 460
const CLAWXPERT_CHATKIT_MAX_WIDTH_PX = 960
const CLAWXPERT_CHAT_COLUMN_MAX_WIDTH_PX = 840
const CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX = 8
const CLAWXPERT_OVERLAY_MIN_TOP_PX = 16
const CLAWXPERT_CHAT_COLUMN_MAX_WIDTH = `${CLAWXPERT_CHAT_COLUMN_MAX_WIDTH_PX}px`
const WORKSPACE_LAYOUT_TRANSITION_CLASSES =
  'transition-[grid-template-columns,grid-template-rows,gap] duration-500 ease-out motion-reduce:transition-none'
const CHAT_SHELL_TRANSITION_CLASSES =
  'transition-[padding,opacity,border-color,background-color,box-shadow,border-radius] duration-500 ease-out motion-reduce:transition-none'
const DETAIL_PANEL_SHELL_TRANSITION_CLASSES =
  'transition-[max-height,opacity,transform] duration-500 ease-out motion-reduce:transition-none will-change-transform'
const DETAIL_PANEL_CONTENT_TRANSITION_CLASSES =
  'transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none will-change-transform'
const INSPECTED_ELEMENT_ACTION_TARGET_TEXT =
  'Action target: Apply to THIS inspected element only; do not change the rest of the file/page unless explicitly asked.'
const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
const KNOWLEDGEBASE_WORKBENCH_VIEW_KEY = 'knowledgebase_workbench'
const WORKBENCH_BROWSER_OPEN_COMMAND = 'workbench.browser.open'
const DEFAULT_FIXED_VIEW_ICON = {
  type: 'font',
  value: 'ri-layout-grid-line',
  alt: 'Fixed view'
} satisfies IconDefinition

type AssistantWorkbenchRequestContext = Omit<AssistantContextSetPayload, 'key' | 'clear'>
type WorkbenchConversationChatkitScope = WorkbenchAssistantConversationResolution & {
  hostRouteKey: string
  requesterXpertId: string
}
type ClawXpertStaticTabId = 'files' | 'terminal' | 'tasks'
type ClawXpertAddableWorkspaceTabKind = ClawXpertStaticTabId | 'browser'
type ClawXpertWorkspaceTabKind = ClawXpertAddableWorkspaceTabKind | 'fixed-view'
type ClawXpertToolTab = {
  id: string
  kind: ClawXpertStaticTabId
}
type ClawXpertBrowserTab = {
  id: string
  kind: 'browser'
  serviceId: string | null
  url: string | null
  displayUrl: string | null
  zoom: number
  deviceToolbarVisible: boolean
  reloadKey: number
}
type ClawXpertWorkspaceTab = ClawXpertToolTab | ClawXpertBrowserTab | ClawXpertFixedViewTab

type ClawXpertConversationPanel = ClawXpertStaticTabId | 'preview' | 'fixed-view'
type ClawXpertBrowserTabChange = Partial<Omit<ClawXpertBrowserTab, 'id' | 'kind'>>
type ClawXpertFixedViewMenuItem = {
  viewKey: string
  title: string
  description: string | null
  icon: IconDefinition | null
  order: number
}
const DEFAULT_BROWSER_ZOOM = 100
const TASKS_WORKSPACE_TAB_ID = 'tasks'

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
    ClawXpertFixedViewStackComponent
  ],
  templateUrl: './clawxpert-conversation-detail.component.html',
  styleUrl: './clawxpert-conversation-detail.component.css'
})
export class ClawXpertConversationDetailComponent implements OnDestroy {
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
      this.#responseActive.set(true)
      if (!this.#workbenchConversationScope()) {
        this.facade.patchActiveConversationStatus('busy')
      }
    },
    onResponseEnd: () => {
      this.#responseActive.set(false)
      if (!this.#workbenchConversationScope()) {
        this.facade.patchActiveConversationStatus('idle')
      }
      this.markChatkitThreadRead(this.activeChatkitThreadId() ?? this.resolvedConversation()?.threadId)
    }
  })
  readonly chatkitMountEntries = computed(() => [{ key: this.chatkitMountKey(), control: this.control()! }])
  readonly workspaceTabs = signal<ClawXpertWorkspaceTab[]>([])
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
        openWorkbenchFilePreviewDialog(this.#dialog, file)
      }
    })
    this.#unregisterNavigationOpenCommand = registerWorkbenchNavigationOpenCommand(this.#clientCommands, {
      navigate: (commands, options) => this.#router.navigate(commands, options),
      openAssistantConversation: (request) => this.openWorkbenchAssistantConversation(request),
      openAssistantProject: ({ projectId }) => this.facade.onChatProjectChange?.(projectId),
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

    const tabs = this.workspaceTabs()
    const closedIndex = tabs.findIndex((tab) => tab.id === tabId)
    if (closedIndex < 0) {
      return
    }

    const nextTabs = tabs.filter((tab) => tab.id !== tabId)
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
          let objectUrl: string | null = null
          let url = readHttpUrl(file.fileUrl ?? file.url)
          if (!url) {
            const blob = await firstValueFrom(
              this.#conversationService.downloadFile(conversationId, target.workspacePath)
            )
            objectUrl = URL.createObjectURL(blob)
            url = objectUrl
          }
          const dialogRef = openWorkbenchFilePreviewDialog(this.#dialog, {
            id: target.fileAssetId,
            fileAssetId: target.fileAssetId,
            storageFileId: target.storageFileId,
            name: target.title ?? target.workspacePath.split('/').pop() ?? target.workspacePath,
            mimeType: file.mimeType,
            size: file.size,
            url,
            previewUrl: url
          })
          if (objectUrl) {
            dialogRef.closed.subscribe(() => URL.revokeObjectURL(objectUrl))
          }
          return
        }
        case 'artifact': {
          const link = await firstValueFrom(this.#artifactService.createSignedPreviewLink(target.artifactId))
          const url = readHttpUrl(link.publicUrl)
          if (!url) {
            throw new Error('Artifact preview URL is unavailable.')
          }
          const version = link.version ?? link.artifact?.currentVersion ?? null
          const mimeType = version?.mimeType ?? undefined
          const title = target.title ?? version?.title ?? link.artifact?.title ?? version?.fileName ?? 'Artifact'
          if (mimeType === 'text/html') {
            this.openBrowserTabFromSandboxEvent({ displayUrl: title, url })
            return
          }
          openWorkbenchFilePreviewDialog(this.#dialog, {
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
      this.#toastr.error(getErrorMessage(error) || 'Failed to open task summary resource.')
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
    this.#fixedViewsLoadVersion += 1
    this.loadingFixedViews.set(false)
    this.fixedViewError.set(null)
    this.fixedViewMenuItems.set([])
    if (removeTabs) {
      this.removeFixedViewTabs()
    }
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
    if (target.faqId || !target.documentId) {
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

function resolveConversationId(metadata?: { id?: string }) {
  const conversationId = metadata?.id
  return typeof conversationId === 'string' && conversationId.trim() ? conversationId : null
}

function assertWorkbenchConversationHint(label: string, hint: string | undefined, canonical: string | null) {
  const normalizedHint = hint?.trim()
  if (normalizedHint && normalizedHint !== canonical) {
    throw new Error(`The requested ${label} does not match the authorized Assistant conversation.`)
  }
}

function clampChatkitWidth(width: number) {
  return Math.min(CLAWXPERT_CHATKIT_MAX_WIDTH_PX, Math.max(CLAWXPERT_CHATKIT_MIN_WIDTH_PX, Math.round(width)))
}

function toConfiguredWorkbenchLayoutState(
  layout: XpertWorkbenchInitialLayoutEnum | null
): ClawXpertWorkbenchLayoutState | null {
  if (layout === null) {
    return 'minimized'
  }
  if (layout === XpertWorkbenchInitialLayoutEnum.TwoColumns) {
    return 'normal'
  }
  if (layout === XpertWorkbenchInitialLayoutEnum.OverlayDialog) {
    return 'overlay'
  }
  if (layout === XpertWorkbenchInitialLayoutEnum.ChatkitMaximized) {
    return 'minimized'
  }
  if (layout === XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized) {
    return 'maximized'
  }
  return null
}

function isMatchingBrowserTab(tab: ClawXpertBrowserTab, target: ClawXpertSandboxPreviewTarget) {
  if (typeof target.serviceId === 'string' && target.serviceId.trim() && tab.serviceId === target.serviceId) {
    return true
  }

  const targetUrl = target.url ?? target.displayUrl
  return typeof targetUrl === 'string' && targetUrl.trim()
    ? tab.url === targetUrl || tab.displayUrl === targetUrl
    : false
}

function toWorkbenchBrowserPreviewTarget(payload: unknown): ClawXpertSandboxPreviewTarget | null {
  if (typeof payload === 'string' && payload.trim()) {
    const url = payload.trim()
    return {
      displayUrl: url,
      url
    }
  }

  if (!isPreviewPayloadRecord(payload)) {
    return null
  }

  const url =
    readPreviewPayloadString(payload, 'url') ??
    readPreviewPayloadString(payload, 'displayUrl') ??
    readPreviewPayloadString(payload, 'deploymentUrl') ??
    readPreviewPayloadString(payload, 'previewUrl')
  if (!url) {
    return null
  }

  return {
    displayUrl: readPreviewPayloadString(payload, 'displayUrl') ?? url,
    url
  }
}

function readPreviewPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isPreviewPayloadRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function shouldShowFixedViewInMenu(manifest: XpertExtensionViewManifest) {
  if (manifest.visible === false) {
    return false
  }
  if (manifest.workbench?.fixed === false) {
    return false
  }
  return manifest.workbench?.menu?.enabled !== false
}

function findFixedViewTab(tabs: ClawXpertFixedViewTab[], viewKey: string | null | undefined) {
  return findResolvedViewByKey(tabs, viewKey)
}

function findResolvedViewByKey<T extends { viewKey: string }>(items: T[], viewKey: string | null | undefined) {
  const normalizedViewKey = viewKey?.trim()
  if (!normalizedViewKey) {
    return undefined
  }

  const exact = items.find((item) => item.viewKey === normalizedViewKey)
  if (exact) {
    return exact
  }

  const aliases = items.filter((item) => item.viewKey.endsWith(`__${normalizedViewKey}`))
  return aliases.length === 1 ? aliases[0] : undefined
}

type KnowledgebaseCitationTarget = {
  knowledgebaseId?: string
  documentId?: string
  faqId?: string
  chunkId?: string
  page?: number
  sourceBlockIds?: string[]
  evidenceText?: string
}

function getKnowledgebaseCitationTarget(event: XpertViewHostEventMessage): KnowledgebaseCitationTarget | null {
  if (event.type !== ASSISTANT_CITATION_OPEN_EVENT || !event.data) {
    return null
  }

  const documentId = getString(event.data['documentId'])
  const faqId = getString(event.data['faqId'])
  if (!documentId && !faqId) {
    return null
  }

  const knowledgebaseId = getString(event.data['knowledgebaseId'])
  const chunkId = getString(event.data['chunkId'])
  const evidenceText = getString(event.data['evidenceText'])
  const pageValue = event.data['page']
  const parsedPage = typeof pageValue === 'number' ? pageValue : typeof pageValue === 'string' ? Number(pageValue) : 0
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : undefined
  const sourceBlockIdsValue = event.data['sourceBlockIds']
  const sourceBlockIds = Array.isArray(sourceBlockIdsValue)
    ? sourceBlockIdsValue
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20)
    : []

  return {
    ...(documentId ? { documentId } : {}),
    ...(faqId ? { faqId } : {}),
    ...(knowledgebaseId ? { knowledgebaseId } : {}),
    ...(chunkId ? { chunkId } : {}),
    ...(page ? { page } : {}),
    ...(sourceBlockIds.length ? { sourceBlockIds } : {}),
    ...(evidenceText ? { evidenceText } : {})
  }
}

function hasTaskSummaryRefresh(
  facade: WorkbenchChatFacade
): facade is WorkbenchChatFacade & { refreshTaskSummaries(): void } {
  return 'refreshTaskSummaries' in facade && typeof facade.refreshTaskSummaries === 'function'
}

function getOptionalSignalValue<T extends string>(facade: WorkbenchChatFacade, key: T): string | null {
  const value = (facade as WorkbenchChatFacade & Record<T, Signal<unknown> | undefined>)[key]
  if (typeof value !== 'function') {
    return null
  }
  return getString(value()) ?? null
}

function buildAssistantRequestContext(input: {
  workspaceId: string | null
  xpertId: string | null
  contexts: Record<string, AssistantWorkbenchRequestContext>
}) {
  const env: Record<string, string> = {}
  if (input.workspaceId) {
    env['workspaceId'] = input.workspaceId
  }
  if (input.xpertId) {
    env['xpertId'] = input.xpertId
  }

  const requestContext: Record<string, unknown> = {}
  for (const [key, context] of Object.entries(input.contexts)) {
    Object.assign(env, normalizeAssistantEnv(context.env))
    if (isRecord(context.context)) {
      requestContext[key] = context.context
    }
  }

  if (Object.keys(env).length) {
    requestContext['env'] = env
  }

  return requestContext
}

function normalizeAssistantWorkbenchContext(
  context: AssistantWorkbenchRequestContext
): AssistantWorkbenchRequestContext {
  const env = normalizeAssistantEnv(context.env)
  const structuredContext = isRecord(context.context) ? context.context : undefined
  return {
    ...(Object.keys(env).length ? { env } : {}),
    ...(structuredContext ? { context: structuredContext } : {})
  }
}

function normalizeAssistantEnv(env: unknown): Record<string, string> {
  if (!isRecord(env)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key, getString(value)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveI18nText(value: string | I18nObject | null | undefined, fallback: string, language?: string | null) {
  if (typeof value === 'string') {
    return value.trim() || fallback
  }
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const normalizedLanguage = (language ?? '').toLowerCase()
  const preferredKeys =
    normalizedLanguage.includes('hant') || normalizedLanguage.includes('tw')
      ? ['zh_Hant', 'zh_Hans', 'en_US']
      : normalizedLanguage.startsWith('zh')
        ? ['zh_Hans', 'zh_Hant', 'en_US']
        : ['en_US', 'zh_Hans', 'zh_Hant']

  for (const key of preferredKeys) {
    const text = Reflect.get(value, key)
    if (typeof text === 'string' && text.trim()) {
      return text.trim()
    }
  }

  for (const text of Object.values(value)) {
    if (typeof text === 'string' && text.trim()) {
      return text.trim()
    }
  }

  return fallback
}

function toFileElementQuoteReference(reference: TChatFileElementReference): ChatKitQuoteReference {
  const source = formatFileElementSource(reference)

  return {
    type: 'quote',
    label: reference.label?.trim() || `${reference.tagName.toLowerCase()} ${reference.selector}`,
    source,
    text: [
      'Reference type: Target inspected HTML file element',
      'Scope: This reference is the currently inspected element only, not the entire file.',
      INSPECTED_ELEMENT_ACTION_TARGET_TEXT,
      `Source location: ${source}`,
      reference.documentTitle?.trim() ? `Document title: ${reference.documentTitle.trim()}` : null,
      'Inspected element:',
      `- Selector: ${reference.selector}`,
      `- DOM path: ${reference.domPath}`,
      `- Tag: ${reference.tagName.toLowerCase()}`,
      reference.role?.trim() ? `- Role: ${reference.role.trim()}` : null,
      `- Attributes: ${formatElementAttributes(reference.attributes)}`,
      'Inspected element visible text:',
      reference.text,
      'Inspected element outerHTML:',
      '```html',
      reference.outerHtml,
      '```'
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
  }
}

function toFilePathQuoteReference(reference: FileWorkbenchFilePathReferenceRequest): ChatKitQuoteReference {
  return {
    type: 'quote',
    label: reference.path,
    source: 'Workspace file',
    text: reference.path
  }
}

function toPageElementQuoteReference(reference: TChatElementReference): ChatKitQuoteReference {
  const source = reference.pageTitle?.trim() || reference.pageUrl.trim()

  return {
    type: 'quote',
    label: reference.label?.trim() || `${reference.tagName.toLowerCase()} ${reference.selector}`,
    source,
    text: [
      'Reference type: Target inspected page element',
      'Scope: This reference is the currently inspected element only, not the entire page.',
      INSPECTED_ELEMENT_ACTION_TARGET_TEXT,
      source ? `Page: ${source}` : null,
      `URL: ${reference.pageUrl}`,
      `Service: ${reference.serviceId}`,
      `Selector: ${reference.selector}`,
      `Tag: ${reference.tagName.toLowerCase()}`,
      reference.role?.trim() ? `Role: ${reference.role.trim()}` : null,
      `Attributes: ${formatElementAttributes(reference.attributes)}`,
      'Visible text:',
      reference.text,
      'HTML:',
      '```html',
      reference.outerHtml,
      '```'
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
  }
}

function resolveEmbeddedChatkitElement(host: HTMLElement) {
  return host.querySelector<HTMLElement>('xpertai-chatkit') ?? host
}

function isChatkitVisuallyMinimizedToPet(chatkitElement: HTMLElement) {
  return (
    chatkitElement.dataset.chatMinimizedToPet === 'true' ||
    (chatkitElement.dataset.displayMode === 'pet' && chatkitElement.dataset.chatOpen !== 'true')
  )
}

function installChatkitOverlayDialogControls(
  chatkitElement: HTMLElement,
  options: { moveLabel: string; resizeLabel: string }
) {
  const shadowRoot = chatkitElement.shadowRoot
  const wrapper = shadowRoot?.querySelector<HTMLElement>('.ck-wrapper')
  const launcherCloseButton = wrapper?.querySelector<HTMLElement>('.ck-launcher-close') ?? null
  const ownerDocument = chatkitElement.ownerDocument
  const ownerWindow = ownerDocument.defaultView

  if (!shadowRoot || !wrapper || !ownerWindow || !ownerDocument.body) {
    return null
  }

  shadowRoot.querySelector(`[${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]`)?.remove()
  shadowRoot.querySelector(`[${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]`)?.remove()
  shadowRoot.querySelector(`[${CHATKIT_OVERLAY_CONTROLS_STYLE_ATTRIBUTE}]`)?.remove()

  const previousCloseButtonDisplay = launcherCloseButton?.style.getPropertyValue('display') ?? ''
  const previousCloseButtonDisplayPriority = launcherCloseButton?.style.getPropertyPriority('display') ?? ''
  const previousCloseButtonAriaHidden = launcherCloseButton?.getAttribute('aria-hidden') ?? null
  const previousCloseButtonTabIndex = launcherCloseButton?.getAttribute('tabindex') ?? null
  launcherCloseButton?.style.setProperty('display', 'none', 'important')
  launcherCloseButton?.setAttribute('aria-hidden', 'true')
  launcherCloseButton?.setAttribute('tabindex', '-1')

  const controlsStyle = ownerDocument.createElement('style')
  controlsStyle.setAttribute(CHATKIT_OVERLAY_CONTROLS_STYLE_ATTRIBUTE, '')
  controlsStyle.textContent = `
    .ck-launcher-close {
      display: none !important;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}] {
      position: absolute;
      top: 1px;
      right: 1px;
      left: 1px;
      z-index: 3;
      height: 18px;
      border: 0;
      border-radius: 17px 17px 0 0;
      background: transparent;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(
        180deg,
        color-mix(in oklab, var(--sys-border-strong) 72%, transparent) 0%,
        color-mix(in oklab, var(--sys-surface-elevated) 36%, transparent) 52%,
        transparent 100%
      );
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]:hover::after,
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]:focus-visible::after,
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}][data-dragging='true']::after {
      opacity: 1;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]:focus-visible {
      outline: none;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}][data-dragging='true'] {
      cursor: grabbing;
    }
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}] {
      position: absolute;
      top: 8px;
      bottom: 8px;
      left: -7px;
      z-index: 3;
      width: 14px;
      border-radius: 999px;
      cursor: ew-resize;
      touch-action: none;
      user-select: none;
    }
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]::after {
      content: '';
      position: absolute;
      top: 50%;
      bottom: auto;
      left: 5px;
      width: 3px;
      height: 44px;
      border-radius: 999px;
      background: color-mix(in oklab, var(--sys-text-secondary) 58%, transparent);
      opacity: 0;
      transform: translateY(-50%);
      transition: opacity 120ms ease;
    }
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]:hover::after,
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]:focus-visible::after,
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}][data-resizing='true']::after {
      opacity: 1;
    }
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]:focus-visible {
      outline: 2px solid color-mix(in oklab, var(--sys-primary) 70%, transparent);
      outline-offset: -2px;
    }
  `

  const dragBar = ownerDocument.createElement('div')
  dragBar.setAttribute(CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE, '')
  dragBar.setAttribute('aria-label', options.moveLabel)
  dragBar.title = options.moveLabel
  dragBar.tabIndex = 0

  const resizeHandle = ownerDocument.createElement('div')
  resizeHandle.setAttribute(CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE, '')
  resizeHandle.setAttribute('role', 'separator')
  resizeHandle.setAttribute('aria-orientation', 'vertical')
  resizeHandle.setAttribute('aria-label', options.resizeLabel)
  resizeHandle.setAttribute('aria-valuemin', `${CLAWXPERT_CHATKIT_MIN_WIDTH_PX}`)
  resizeHandle.setAttribute('aria-valuemax', `${CLAWXPERT_CHATKIT_MAX_WIDTH_PX}`)
  resizeHandle.title = options.resizeLabel
  resizeHandle.tabIndex = 0

  shadowRoot.appendChild(controlsStyle)
  wrapper.append(dragBar, resizeHandle)

  let activeInteractionCleanup: (() => void) | null = null

  const stopActiveInteraction = () => {
    activeInteractionCleanup?.()
    activeInteractionCleanup = null
  }

  const startPointerInteraction = (
    event: PointerEvent,
    cursor: string,
    onMove: (moveEvent: PointerEvent) => void,
    activeAttribute: 'data-dragging' | 'data-resizing',
    target: HTMLElement
  ) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    stopActiveInteraction()

    const previousCursor = ownerDocument.body.style.cursor
    const previousUserSelect = ownerDocument.body.style.userSelect
    const pointerId = event.pointerId

    if (typeof pointerId === 'number' && typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(pointerId)
      } catch {
        // Pointer capture is optional; window listeners keep the interaction active over the iframe.
      }
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (typeof pointerId === 'number' && moveEvent.pointerId !== pointerId) {
        return
      }
      moveEvent.preventDefault()
      onMove(moveEvent)
    }

    const finishInteraction = () => {
      cleanupInteraction()
    }

    const cleanupInteraction = () => {
      ownerWindow.removeEventListener('pointermove', handlePointerMove)
      ownerWindow.removeEventListener('pointerup', finishInteraction)
      ownerWindow.removeEventListener('pointercancel', finishInteraction)
      ownerDocument.body.style.cursor = previousCursor
      ownerDocument.body.style.userSelect = previousUserSelect
      target.removeAttribute(activeAttribute)
      if (activeInteractionCleanup === cleanupInteraction) {
        activeInteractionCleanup = null
      }
    }

    ownerDocument.body.style.cursor = cursor
    ownerDocument.body.style.userSelect = 'none'
    target.setAttribute(activeAttribute, 'true')
    ownerWindow.addEventListener('pointermove', handlePointerMove)
    ownerWindow.addEventListener('pointerup', finishInteraction, { once: true })
    ownerWindow.addEventListener('pointercancel', finishInteraction, { once: true })
    activeInteractionCleanup = cleanupInteraction
  }

  const moveOverlayDialog = (left: number, top: number, width: number, height: number) => {
    const maxLeft = Math.max(
      CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX,
      ownerWindow.innerWidth - width - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX
    )
    const maxTop = Math.max(
      CLAWXPERT_OVERLAY_MIN_TOP_PX,
      ownerWindow.innerHeight - height - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX
    )

    wrapper.style.left = `${Math.round(clampNumber(left, CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX, maxLeft))}px`
    wrapper.style.top = `${Math.round(clampNumber(top, CLAWXPERT_OVERLAY_MIN_TOP_PX, maxTop))}px`
    wrapper.style.right = 'auto'
    wrapper.style.bottom = 'auto'
  }

  const resizeOverlayDialog = (right: number, desiredWidth: number) => {
    const rightEdge = clampNumber(
      right,
      CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX,
      Math.max(CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX, ownerWindow.innerWidth - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX)
    )
    const maxWidth = Math.max(
      0,
      Math.min(
        CLAWXPERT_CHATKIT_MAX_WIDTH_PX,
        ownerWindow.innerWidth - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX * 2,
        rightEdge - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX
      )
    )
    const minWidth = Math.min(CLAWXPERT_CHATKIT_MIN_WIDTH_PX, maxWidth)
    const width = Math.round(clampNumber(desiredWidth, minWidth, maxWidth))

    wrapper.style.left = `${Math.round(rightEdge - width)}px`
    wrapper.style.right = 'auto'
    wrapper.style.width = `${width}px`
    resizeHandle.setAttribute('aria-valuenow', `${width}`)
  }

  const handleDragPointerDown = (event: PointerEvent) => {
    const rect = wrapper.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY

    startPointerInteraction(
      event,
      'grabbing',
      (moveEvent) => {
        moveOverlayDialog(
          rect.left + moveEvent.clientX - startX,
          rect.top + moveEvent.clientY - startY,
          rect.width,
          rect.height
        )
      },
      'data-dragging',
      dragBar
    )
  }

  const handleResizePointerDown = (event: PointerEvent) => {
    const rect = wrapper.getBoundingClientRect()
    const startX = event.clientX

    startPointerInteraction(
      event,
      'ew-resize',
      (moveEvent) => {
        resizeOverlayDialog(rect.right, rect.width + startX - moveEvent.clientX)
      },
      'data-resizing',
      resizeHandle
    )
  }

  const handleDragKeydown = (event: KeyboardEvent) => {
    const direction =
      event.key === 'ArrowLeft'
        ? { x: -1, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: 1, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -1 }
            : event.key === 'ArrowDown'
              ? { x: 0, y: 1 }
              : null
    if (!direction) {
      return
    }

    event.preventDefault()
    const rect = wrapper.getBoundingClientRect()
    const step = event.shiftKey ? 64 : 24
    moveOverlayDialog(rect.left + direction.x * step, rect.top + direction.y * step, rect.width, rect.height)
  }

  const handleResizeKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }

    event.preventDefault()
    const rect = wrapper.getBoundingClientRect()
    resizeOverlayDialog(rect.right, rect.width + (event.key === 'ArrowLeft' ? 32 : -32))
  }

  const constrainOverlayDialogToViewport = () => {
    if (!wrapper.style.left && !wrapper.style.top && !wrapper.style.width) {
      return
    }

    const rect = wrapper.getBoundingClientRect()
    const rightEdge = Math.min(rect.right, ownerWindow.innerWidth - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX)
    resizeOverlayDialog(rightEdge, rect.width)
    moveOverlayDialog(
      Number.parseFloat(wrapper.style.left),
      rect.top,
      Number.parseFloat(wrapper.style.width),
      rect.height
    )
  }

  dragBar.addEventListener('pointerdown', handleDragPointerDown)
  dragBar.addEventListener('keydown', handleDragKeydown)
  resizeHandle.addEventListener('pointerdown', handleResizePointerDown)
  resizeHandle.addEventListener('keydown', handleResizeKeydown)
  ownerWindow.addEventListener('resize', constrainOverlayDialogToViewport)

  const initialWidth = Math.round(wrapper.getBoundingClientRect().width)
  if (initialWidth > 0) {
    resizeHandle.setAttribute('aria-valuenow', `${initialWidth}`)
  }

  return () => {
    stopActiveInteraction()
    dragBar.removeEventListener('pointerdown', handleDragPointerDown)
    dragBar.removeEventListener('keydown', handleDragKeydown)
    resizeHandle.removeEventListener('pointerdown', handleResizePointerDown)
    resizeHandle.removeEventListener('keydown', handleResizeKeydown)
    ownerWindow.removeEventListener('resize', constrainOverlayDialogToViewport)
    dragBar.remove()
    resizeHandle.remove()
    controlsStyle.remove()
    if (launcherCloseButton) {
      if (previousCloseButtonDisplay) {
        launcherCloseButton.style.setProperty('display', previousCloseButtonDisplay, previousCloseButtonDisplayPriority)
      } else {
        launcherCloseButton.style.removeProperty('display')
      }
      restoreOptionalAttribute(launcherCloseButton, 'aria-hidden', previousCloseButtonAriaHidden)
      restoreOptionalAttribute(launcherCloseButton, 'tabindex', previousCloseButtonTabIndex)
    }
    wrapper.style.removeProperty('left')
    wrapper.style.removeProperty('top')
    wrapper.style.removeProperty('right')
    wrapper.style.removeProperty('bottom')
    wrapper.style.removeProperty('width')
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function restoreOptionalAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    element.removeAttribute(name)
  } else {
    element.setAttribute(name, value)
  }
}

function toSkillTrialRuntimeCapabilities(intent: ClawXpertSkillTrialIntent): RuntimeCapabilitiesSelection {
  return {
    mode: 'allowlist',
    skills: {
      workspaceId: intent.workspaceId,
      ids: [intent.skillPackageId]
    },
    plugins: {
      nodeKeys: []
    },
    subAgents: {
      nodeKeys: []
    }
  }
}

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readHttpUrl(value: unknown) {
  const text = readNonEmptyString(value)
  if (!text) {
    return null
  }
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function setWritableSignalValue<T>(signalValue: Signal<T>, value: T) {
  const setter = (signalValue as Signal<T> & { set?: (next: T) => void }).set
  if (typeof setter === 'function') {
    setter.call(signalValue, value)
  }
}

function normalizeConversationThreadId(threadId: string | null | undefined) {
  return typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null
}

function equalViewQuery(left: XpertViewQuery | null, right: XpertViewQuery | null) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function formatFileElementSource(reference: TChatFileElementReference) {
  if (typeof reference.sourceStartLine !== 'number') {
    return reference.filePath
  }

  const lineRange =
    reference.sourceStartLine === reference.sourceEndLine
      ? `${reference.sourceStartLine}`
      : `${reference.sourceStartLine}-${reference.sourceEndLine ?? reference.sourceStartLine}`

  return `${reference.filePath}:${lineRange}`
}

function formatElementAttributes(attributes: Array<{ name: string; value: string }>) {
  if (!attributes.length) {
    return '(none)'
  }

  return attributes.map((attribute) => `${attribute.name}="${attribute.value}"`).join(' ')
}

function isFileElementReferenceRequest(request: FileWorkbenchReferenceRequest): request is TChatFileElementReference {
  return 'type' in request && request.type === 'file_element'
}

function isFilePathReferenceRequest(
  request: FileWorkbenchReferenceRequest
): request is FileWorkbenchFilePathReferenceRequest {
  return 'type' in request && request.type === 'file_path'
}
