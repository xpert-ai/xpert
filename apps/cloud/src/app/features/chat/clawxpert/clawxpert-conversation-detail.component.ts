import { Dialog } from '@angular/cdk/dialog'
import { CommonModule, DOCUMENT } from '@angular/common'
import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, untracked, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatKit, type ChatKitControl } from '@xpert-ai/chatkit-angular'
import type { ProjectSelection, XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { ZardIconComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom, map } from 'rxjs'
import {
  AiThreadService,
  ChatConversationService,
  GroupWorkbenchApiService,
  IChatConversation,
  Store,
  ViewExtensionApiService,
  getErrorMessage,
  injectToastr
} from '../../../@core'
import { ChatkitLifecycleService } from '../../../@core/services/chatkit-lifecycle.service'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import { ViewHostEventBus } from '../../../@shared/view-extension/view-host-event-bus.service'
import {
  registerAssistantChatSendMessageCommand,
  registerAssistantContextSetCommand
} from '../../assistant/assistant-chat-client-command'
import { injectHostedAssistantChatkitControl } from '../../assistant/assistant-chatkit.runtime'
import { registerAssistantComposerAppendReferencesCommand } from '../../assistant/assistant-composer-client-command'
import { createChatkitWorkbenchClientCommandHandler } from '../../assistant/chatkit-workbench-client-command'
import { createKnowledgebaseCitationOpenHostEvent } from '../../assistant/knowledgebase-citation-effect'
import { registerWorkbenchFileOpenCommand } from '../../assistant/workbench-file-open-client-command'
import { openWorkbenchFilePreviewDialog } from '../../assistant/workbench-file-preview-dialog.component'
import {
  registerWorkbenchNavigationOpenCommand,
  type WorkbenchAssistantConversationOpenRequest,
  type WorkbenchExtensionViewOpenRequest
} from '../../assistant/workbench-navigation-open-client-command'
import { injectWorkspaceConnectorClientCommand } from '../../assistant/workspace-connector-client-command'
import { XpertProjectApiService } from '../../project/project-api.service'
import {
  chatProjectCreateRequest,
  executeChatProjectCreate,
  type ChatProjectCreateRequest
} from '../../project/project-chat-create'
import { injectFrequentQuestionsStartScreen } from '../workbench-chat/frequent-questions-start-screen'
import { WORKBENCH_CHAT_FACADE, WorkbenchChatFacade } from '../workbench-chat/workbench-chat.facade'
import { WorkbenchLoadingIndicatorComponent } from '../workbench-chat/workbench-loading-indicator.component'
import { createAssistantToolCompletedHostEvent } from './assistant-tool-host-events.utils'
import { createChatkitWorkbenchNavigation } from './chatkit-workbench-navigation'
import {
  ClawXpertSkillTrialIntentService,
  type ClawXpertSkillTrialIntent
} from './clawxpert-skill-trial-intent.service'
import { getTaskSummaryResourceTarget } from './clawxpert-task-summary-effect.utils'
import { ClawXpertWorkbenchViewUrlState } from './clawxpert-workbench-view-url-state.service'
import { ClawXpertFacade } from './clawxpert.facade'
import {
  CONVERSATION_DETAIL_RELATIONS,
  assertWorkbenchConversationHint,
  getOptionalSignalValue,
  normalizeConversationThreadId,
  resolveConversationId,
  setWritableSignalValue,
  type WorkbenchConversationChatkitScope
} from './conversation-detail/chatkit/conversation'
import { CLAWXPERT_CHAT_COLUMN_MAX_WIDTH } from './conversation-detail/chatkit/layout'
import { injectChatkitWorkbenchViews } from './conversation-detail/chatkit/views'
import { injectKnowledgebaseCitationNavigation } from './conversation-detail/citations/navigation'
import {
  buildAssistantRequestContext,
  normalizeAssistantWorkbenchContext,
  type AssistantWorkbenchRequestContext
} from './conversation-detail/composer/request-context'
import { readNonEmptyString, toSkillTrialRuntimeCapabilities } from './conversation-detail/composer/skill-trial'
import {
  focusConversationMapMessage,
  installConversationMapLinks
} from './conversation-detail/conversation-map-navigation'
import { canRenderViewInChatkit, findResolvedViewByKey } from './conversation-detail/workspace/fixed-views'
import { createGroupWorkbenchScope } from './group-workbench-scope'

import { injectChatkitResourceFallback } from './conversation-detail/chatkit/resource-fallback'

@Component({
  standalone: true,
  selector: 'xp-clawxpert-conversation-detail',
  imports: [CommonModule, WorkbenchLoadingIndicatorComponent, TranslateModule, ChatKit, ZardIconComponent],
  host: { class: 'flex h-full min-h-0 min-w-0 flex-col' },
  templateUrl: './clawxpert-conversation-detail.component.html'
})
export class ClawXpertConversationDetailComponent implements OnDestroy {
  readonly #openCitation = injectKnowledgebaseCitationNavigation({
    available: (key) => this.#isChatkitView(key),
    openView: (request) => this.openWorkbenchView(request)
  })
  readonly #resourceFallback = injectChatkitResourceFallback({
    assistantId: () => this.chatkitAssistantId(),
    threadId: () => this.activeChatkitThreadId(),
    projectId: () => this.chatkitProjectId(),
    control: () => this.control(),
    conversationId: () => this.#workbenchConversationScope()?.conversationId ?? this.resolvedConversationId()
  })

  readonly #threadService = inject(AiThreadService)
  readonly #conversationService = inject(ChatConversationService)
  readonly #viewExtensionApi = inject(ViewExtensionApiService)
  readonly #groupWorkbenchApi = inject(GroupWorkbenchApiService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #clientCommands = inject(ViewClientCommandRegistry)
  readonly #hostEvents = inject(ViewHostEventBus)
  readonly #browserDocument = inject(DOCUMENT)
  readonly #chatkitLifecycle = inject(ChatkitLifecycleService)

  private readonly registerChatkitLifecycle = effect((onCleanup) => {
    const host = this.chatkitHost()?.nativeElement
    if (host) onCleanup(this.#chatkitLifecycle.register(host))
  })

  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #skillTrialIntent = inject(ClawXpertSkillTrialIntentService)
  readonly #workbenchViewUrlState = inject(ClawXpertWorkbenchViewUrlState)
  readonly #projectApi = inject(XpertProjectApiService)
  readonly #store = inject(Store)

  // Existing Project membership grants collaboration, not permission to create another Project.
  readonly #canCreateProject = toSignal(
    this.#store.userRolePermissions$.pipe(map(() => this.#store.hasPermission(AIPermissionsEnum.XPERT_PROJECT_CREATE))),
    { initialValue: false }
  )

  readonly #responseActive = signal(false)
  #unregisterComposerCommand: (() => void) | null = null
  #unregisterAssistantCommand: (() => void) | null = null
  #unregisterAssistantContextCommand: (() => void) | null = null
  #unregisterFileOpenCommand: (() => void) | null = null
  #unregisterConversationMapLinks: (() => void) | null = null
  #unregisterNavigationOpenCommand: (() => void) | null = null
  #assistantWorkbenchContextScopeKey: string | null = null
  #markReadRequestVersion = 0
  #activeChatkitControl: ChatKitControl | null = null
  #lastSyncedRoutedThreadId: string | null = null
  #chatkitOriginThreadId: string | null = null
  readonly #workbenchConversationScope = signal<WorkbenchConversationChatkitScope | null>(null)
  #chatkitThreadSync = Promise.resolve()
  #projectCreatePending = false
  readonly #providedFacade = inject(WORKBENCH_CHAT_FACADE, { optional: true })
  readonly facade: WorkbenchChatFacade = this.#providedFacade ?? inject(ClawXpertFacade)
  readonly projectId = computed(() => getOptionalSignalValue(this.facade, 'projectId'))
  readonly runtimeProjectId = computed(() =>
    this.facade.projectId ? this.projectId() : (this.resolvedConversation()?.projectId ?? null)
  )

  readonly #projectControlsEnabled = computed(
    () => !this.#workbenchConversationScope() && Boolean(this.facade.assistantId()?.trim())
  )

  readonly #hostChatRouteKey = computed(() =>
    JSON.stringify([
      this.facade.assistantId()?.trim() || null,
      this.projectId(),
      this.facade.threadId(),
      this.facade.group?.()?.id ?? null
    ])
  )

  readonly #assistantWorkbenchContexts = signal<Record<string, AssistantWorkbenchRequestContext>>({})

  private executionFocusSequence = 0

  readonly #executionFocus = signal<{ threadId: string; executionId: string; requestId: string } | null>(null)
  readonly assistantRequestContext = computed(() =>
    buildAssistantRequestContext({
      workspaceId: getOptionalSignalValue(this.facade, 'currentWorkspaceId'),
      xpertId: this.#workbenchConversationScope()?.xpertId ?? this.facade.xpertId(),
      contexts: this.#assistantWorkbenchContexts(),
      executionFocus: this.#executionFocus()?.threadId === this.activeChatkitThreadId() ? this.#executionFocus() : null
    })
  )

  readonly chatkitAssistantId = computed(() => this.#workbenchConversationScope()?.xpertId ?? this.facade.assistantId())
  readonly chatkitGroup = computed(() => (this.#workbenchConversationScope() ? null : (this.facade.group?.() ?? null)))
  readonly chatkitProjectId = computed(() => {
    const scope = this.#workbenchConversationScope()
    return scope
      ? scope.projectId
      : this.facade.chatkitMountProjectId
        ? this.facade.chatkitMountProjectId()
        : this.projectId()
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

  readonly activeChatkitThreadId = computed(
    () => this.#workbenchConversationScope()?.threadId ?? this.facade.threadId()
  )

  readonly startScreen = injectFrequentQuestionsStartScreen({
    xpert: computed(() => this.facade.currentXpert?.() ?? null),
    active: computed(() => this.facade.viewState() === 'ready' && !this.chatkitInitialThread() && !this.chatkitGroup())
  })

  readonly #isChatkitView = (key: string | null) =>
    canRenderViewInChatkit(findResolvedViewByKey(this.availableWorkbenchViews(), key)?.view)

  readonly #chatkitNavigation = createChatkitWorkbenchNavigation({
    assistantId: () => this.chatkitAssistantId(),
    projectId: () => this.chatkitProjectId(),
    routeKey: () => this.#hostChatRouteKey(),
    defaultViewKey: () => this.facade.defaultViewKey(),
    isChatkitView: this.#isChatkitView,
    views: this.#viewExtensionApi,
    url: this.#workbenchViewUrlState,
    selectProject: (id, view) => this.facade.onChatProjectChange?.(id, view)
  })

  readonly control = injectHostedAssistantChatkitControl({
    identity: computed(() => (this.facade.viewState() === 'ready' ? this.facade.identity() : null)),
    assistantId: this.chatkitAssistantId,
    loading: this.facade.loading,
    group: this.chatkitGroup,
    frameUrl: this.facade.chatkitFrameUrl,
    requestContext: this.assistantRequestContext,
    projectId: this.chatkitProjectId,
    delegatedConversation: this.chatkitDelegatedConversation,
    composer: computed(() => ({
      projects: {
        enabled: this.#projectControlsEnabled(),
        createEnabled: this.#projectControlsEnabled() && this.#canCreateProject(),
        selection: this.#workbenchConversationScope() ? undefined : this.facade.chatkitProjectSelection?.(),
        autoNewEnabled:
          !this.#workbenchConversationScope() &&
          this.#canCreateProject() &&
          Boolean(this.facade.currentXpert?.()?.options?.workspaceScope?.onMissing),
        autoNewMode:
          this.facade.currentXpert?.()?.options?.workspaceScope?.onMissing === 'confirm'
            ? ('after-confirmation' as const)
            : ('on-send' as const),
        allowNone: this.facade.currentXpert?.()?.options?.workspaceScope?.mode !== 'project-required'
      },
      connectors: { enabled: true }
    })),
    initialThread: this.chatkitInitialThread,
    startScreen: this.startScreen,
    displayMode: 'chat',
    layout: {
      maxWidth: CLAWXPERT_CHAT_COLUMN_MAX_WIDTH
    },
    taskSummary: {
      enabled: true
    },
    // Keep the final reply visible while retaining earlier process messages in an expandable section.
    messagePresentation: {
      collapseProcess: true
    },
    workbench: computed(() => ({
      navigation: this.#chatkitNavigation.state(),
      onNavigationChange: this.#chatkitNavigation.onNavigationChange,
      enabled: true,
      // The embedder supplies an address only; ChatKit resolves and navigates resources.
      linkBaseUrl: (() => {
        const base = this.#browserDocument.location.href.match(/^(https?:\/\/[^/]+\/chat\/x\/[^/?#]+)/)?.[1]
        return base ? `${base}/p/{projectId}/c` : undefined
      })(),
      onClientCommand: createChatkitWorkbenchClientCommandHandler({
        conversations: this.#conversationService,
        getScope: () => ({
          assistantId: this.chatkitAssistantId(),
          runtimeScope: {
            projectId: this.chatkitProjectId(),
            conversationId: this.#workbenchConversationScope()?.conversationId ?? this.resolvedConversationId()
          }
        }),
        views: this.#viewExtensionApi,
        commands: this.#clientCommands
      }),
      sideChat: {
        enabled: true
      }
    })),
    titleKey: this.facade.definition.titleKey,
    titleDefault: this.facade.definition.defaultTitle,
    onThreadChange: ({ threadId }) => {
      const normalizedThreadId = normalizeConversationThreadId(threadId)
      if (this.#executionFocus()?.threadId !== normalizedThreadId) this.#executionFocus.set(null)
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
    onProjectChange: ({ projectId, selection }: { projectId: string | null; selection?: ProjectSelection }) => {
      if (this.#workbenchConversationScope()) {
        return
      }
      this.facade.onChatProjectChange?.(projectId, undefined, selection)
    },
    onThreadLoadEnd: ({ threadId }) => {
      this.markChatkitThreadRead(threadId)
      if (threadId && !this.#workbenchConversationScope()) void this.facade.syncConversationProject?.(threadId)
    },
    onEffect: (event) => {
      const projectRequest = chatProjectCreateRequest(event)
      if (projectRequest) {
        void this.createChatProject(projectRequest)
        return
      }
      const taskSummaryTarget = getTaskSummaryResourceTarget(event)
      if (taskSummaryTarget) {
        void this.#resourceFallback.open(taskSummaryTarget)
        return
      }
      const citationEvent = createKnowledgebaseCitationOpenHostEvent(event, {
        hostType: 'agent',
        hostId: this.facade.xpertId(),
        threadId: this.activeChatkitThreadId()
      })
      if (citationEvent) {
        void this.#openCitation(citationEvent)
      }
    },
    onLog: (event) => {
      if (event.name === 'lg.conversation.start' && !this.#workbenchConversationScope()) {
        const threadId = this.activeChatkitThreadId()
        if (threadId) void this.facade.syncConversationProject?.(threadId)
      }
      const toolCompletedEvent = createAssistantToolCompletedHostEvent(event, {
        hostType: 'agent',
        hostId: this.facade.xpertId(),
        threadId: this.activeChatkitThreadId(),
        runtimeScope: this.viewRuntimeScope(),
        userId: this.facade.userId()
      })
      if (toolCompletedEvent) {
        this.#hostEvents.publish(toolCompletedEvent)
      }
    },
    onResponseStart: () => {
      this.#responseActive.set(true)
      if (!this.#workbenchConversationScope()) {
        this.facade.patchActiveConversationStatus('busy')
      }
    },
    onResponseEnd: () => {
      const threadId = this.activeChatkitThreadId()
      if (threadId && !this.#workbenchConversationScope()) void this.facade.syncConversationProject?.(threadId)
      this.#responseActive.set(false)
      if (!this.#workbenchConversationScope()) {
        this.facade.patchActiveConversationStatus('idle')
      }
      this.markChatkitThreadRead(this.activeChatkitThreadId() ?? this.resolvedConversation()?.threadId)
    }
  })

  readonly chatkitMountEntries = computed(() => {
    const control = this.control()
    return control ? [{ key: this.facade.chatkitFrameUrl(), control }] : []
  })

  readonly groupWorkbenchScope = createGroupWorkbenchScope({
    groupId: () => this.facade.group?.()?.id ?? null,
    identity: this.facade.identity,
    assistantId: this.facade.xpertId,
    ready: () => !this.facade.loading() && this.facade.viewState() === 'ready',
    api: this.#groupWorkbenchApi,
    onError: (error) => this.#toastr.error(getErrorMessage(error))
  })

  readonly fixedViewHostId = computed(() =>
    this.facade.viewState() === 'ready' && (!this.facade.group?.() || this.groupWorkbenchScope())
      ? this.facade.xpertId()
      : null
  )

  readonly resolvedConversationId = signal<string | null>(null)
  readonly resolvedConversation = signal<IChatConversation | null>(null)
  readonly viewRuntimeScope = computed<XpertViewRuntimeScopeInput>(() => {
    if (this.facade.group?.()) return this.groupWorkbenchScope() ?? { groupId: this.facade.group().id }
    const projectId = this.runtimeProjectId()
    return {
      projectId,
      // Project-bound Workbench Views share one durable data scope. Switching
      // the inspected ChatKit execution inside that Project must update ChatKit
      // without invalidating and recreating the Remote View iframe.
      conversationId: projectId ? null : this.resolvedConversationId()
    }
  })

  readonly availableWorkbenchViews = injectChatkitWorkbenchViews({
    hostId: () => this.fixedViewHostId(),
    scope: () => this.viewRuntimeScope()
  })
  readonly contextLoading = signal(false)
  readonly contextError = signal<string | null>(null)
  readonly chatkitHost = viewChild('chatkitHost', { read: ElementRef<HTMLElement> })

  constructor() {
    injectWorkspaceConnectorClientCommand(this.chatkitAssistantId)
    effect((onCleanup) => {
      const hostId = this.fixedViewHostId()
      const projectId = this.#workbenchViewUrlState.projectId()
      const viewKey = this.#workbenchViewUrlState.viewKey()
      const query = this.#workbenchViewUrlState.viewQuery()
      this.#hostChatRouteKey()
      if (!hostId || !projectId || !viewKey) return
      let cancelled = false
      untracked(
        () =>
          void this.#chatkitNavigation
            .openProject({ projectId, view: { viewKey, ...query } }, () => cancelled)
            .catch((error) => {
              if (!cancelled) this.#toastr.error(getErrorMessage(error))
            })
      )
      onCleanup(() => {
        cancelled = true
      })
    })

    this.#unregisterComposerCommand = registerAssistantComposerAppendReferencesCommand(this.#clientCommands, {
      getControl: () => this.control(),
      isReady: () => !this.facade.loading() && this.facade.viewState() === 'ready'
    })

    this.#unregisterAssistantCommand = registerAssistantChatSendMessageCommand(this.#clientCommands, {
      getControl: () => this.control(),
      isReady: () => !this.facade.loading() && this.facade.viewState() === 'ready',
      unavailableMessage: 'Current Assistant ChatKit is not ready.'
    })

    this.#unregisterAssistantContextCommand = registerAssistantContextSetCommand(this.#clientCommands, {
      setContext: (key, context) => {
        this.setAssistantWorkbenchContext(key, context)
      }
    })

    this.#unregisterFileOpenCommand = registerWorkbenchFileOpenCommand(this.#clientCommands, {
      openFile: (file) => {
        openWorkbenchFilePreviewDialog(this.#dialog, file)
      }
    })

    this.#unregisterConversationMapLinks = installConversationMapLinks({
      ready: () => this.facade.viewState() === 'ready' && Boolean(this.control()),
      assistantId: () => this.facade.assistantId() ?? null,
      open: (request) => this.openWorkbenchAssistantConversation(request),
      onError: (error) => this.#toastr.error(getErrorMessage(error))
    })

    this.#unregisterNavigationOpenCommand = registerWorkbenchNavigationOpenCommand(this.#clientCommands, {
      navigate: (commands, options) => this.#router.navigate(commands, options),
      openAssistantConversation: (request) => this.openWorkbenchAssistantConversation(request),
      openAssistantProject: (request) => this.#chatkitNavigation.openProject(request),
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
      const control = this.control()
      const threadId = this.facade.threadId()
      const viewState = this.facade.viewState()

      if (!control || this.facade.loading() || viewState !== 'ready') {
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
            this.facade.loading() ||
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
      const scopeKey = `${hostId ?? 'none'}:${runtimeScope.groupId ?? 'private'}:${runtimeScope.projectId ?? 'personal'}:${runtimeScope.conversationId ?? 'new'}`
      if (scopeKey === this.#assistantWorkbenchContextScopeKey) {
        return
      }

      this.#assistantWorkbenchContextScopeKey = scopeKey
      this.#assistantWorkbenchContexts.set({})
    })

    effect((onCleanup) => {
      const pendingStartId = this.facade.pendingConversationStartId()
      const control = this.control()

      if (!pendingStartId || this.facade.loading() || this.facade.viewState() !== 'ready' || !control) {
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

      if (!intent || this.facade.loading() || this.facade.viewState() !== 'ready' || !control) {
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

      if (!control || threadId || this.facade.loading() || viewState !== 'ready' || loadingUserPreference) {
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

  async openWorkbenchAssistantConversation(request: WorkbenchAssistantConversationOpenRequest) {
    const requesterXpertId = this.facade.assistantId()?.trim() || this.facade.xpertId()?.trim()
    if (!requesterXpertId) {
      throw new Error('The current Workbench Assistant is not available.')
    }

    const resolution = await firstValueFrom(
      this.#conversationService.resolveWorkbenchNavigation(request.conversationId, requesterXpertId, undefined, {
        threadId: request.threadId,
        messageId: request.messageId
      })
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
    await control.setThreadId(resolution.threadId)
    if (!requiresScopedRuntime) this.facade.onChatThreadChange(resolution.threadId)
    // Reuse ChatKit's exact execution focus after the authorized thread is active.
    this.#executionFocus.set(
      request.executionId
        ? {
            threadId: resolution.threadId,
            executionId: request.executionId,
            requestId: String(++this.executionFocusSequence)
          }
        : null
    )
    await focusConversationMapMessage(this.control(), { ...resolution, messageId: request.messageId })
    this.markConversationRead(resolution.conversationId)
    return resolution
  }

  private async createChatProject(request: ChatProjectCreateRequest) {
    const assistantId = this.facade.assistantId()?.trim()
    if (!assistantId || !this.#projectControlsEnabled() || !this.#canCreateProject() || this.#projectCreatePending) {
      return
    }

    this.#projectCreatePending = true
    try {
      await executeChatProjectCreate(this.#projectApi, this.#router, request, assistantId, (projectId) =>
        this.facade.onChatProjectChange?.(projectId)
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to create the Project.')
    } finally {
      this.#projectCreatePending = false
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

      const latestThreadId = normalizeConversationThreadId(conversation?.threadId ?? baseConversation?.threadId)
      if (latestThreadId && latestThreadId !== threadId && !this.#workbenchConversationScope()) {
        this.facade.onChatThreadChange(latestThreadId)
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

  openWorkbenchView(request: WorkbenchExtensionViewOpenRequest) {
    return this.#chatkitNavigation.openView(request)
  }

  ngOnDestroy() {
    this.#unregisterComposerCommand?.()
    this.#unregisterAssistantCommand?.()
    this.#unregisterAssistantContextCommand?.()
    this.#unregisterFileOpenCommand?.()
    this.#unregisterConversationMapLinks?.()
    this.#unregisterNavigationOpenCommand?.()
    this.#responseActive.set(false)
    this.facade.setActiveConversation(null)
  }
}
